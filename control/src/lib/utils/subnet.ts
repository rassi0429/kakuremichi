import { db, tunnels, gateways, tunnelGatewayIps } from '../db';
import { eq, isNotNull, and } from 'drizzle-orm';

/**
 * Subnet allocation result for a Tunnel
 */
export interface TunnelSubnetAllocation {
  subnet: string;    // e.g., "10.1.0.0/24"
  agentIp: string;   // e.g., "10.1.0.2" (from front)
}

/**
 * Allocate a new subnet for a Tunnel
 * Each Tunnel gets its own /24 subnet: 10.1.0.0/24, 10.2.0.0/24, etc.
 * Agent IP is assigned from the front (.2)
 * @returns Subnet allocation with subnet and agentIp
 */
export async function allocateTunnelSubnet(): Promise<TunnelSubnetAllocation> {
  // Get all existing subnets from tunnels
  const existingTunnels = await db
    .select({ subnet: tunnels.subnet })
    .from(tunnels)
    .where(isNotNull(tunnels.subnet));

  // Extract subnet numbers (10.X.0.0/24 -> X)
  const usedNumbers = new Set<number>();
  for (const tunnel of existingTunnels) {
    if (tunnel.subnet) {
      const match = tunnel.subnet.match(/^10\.(\d+)\.0\.0\/24$/);
      if (match && match[1]) {
        usedNumbers.add(parseInt(match[1], 10));
      }
    }
  }

  // Find the next available number (start from 1)
  let nextNumber = 1;
  while (usedNumbers.has(nextNumber) && nextNumber <= 254) {
    nextNumber++;
  }

  if (nextNumber > 254) {
    throw new Error('Subnet limit reached (max: 254 tunnels)');
  }

  return {
    subnet: `10.${nextNumber}.0.0/24`,
    agentIp: `10.${nextNumber}.0.2`,  // Agent IP from front (.2, .1 is reserved)
  };
}

/**
 * Allocate Gateway IPs for a tunnel from the back (.254, .253, ...)
 * @param tunnelId The tunnel to allocate IPs for
 * @param subnet The tunnel's subnet (e.g., "10.1.0.0/24")
 * @returns Array of allocated gateway IPs with their gateway IDs
 */
export async function allocateGatewayIpsForTunnel(
  tunnelId: string,
  subnet: string
): Promise<Array<{ gatewayId: string; ip: string }>> {
  // Parse subnet to get the prefix (e.g., "10.1.0" from "10.1.0.0/24")
  const subnetMatch = subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/24$/);
  if (!subnetMatch) {
    throw new Error(`Invalid subnet format: ${subnet}`);
  }
  const subnetPrefix = subnetMatch[1];

  // Get all gateways
  const allGateways = await db.select().from(gateways);
  if (allGateways.length === 0) {
    return [];
  }

  // Get existing gateway IPs for this tunnel
  const existingIps = await db
    .select()
    .from(tunnelGatewayIps)
    .where(eq(tunnelGatewayIps.tunnelId, tunnelId));

  const existingGatewayIds = new Set(existingIps.map(e => e.gatewayId));
  const usedLastOctets = new Set(existingIps.map(e => {
    const match = e.ip.match(/\.(\d+)$/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  }));

  // Allocate IPs for gateways that don't have one yet
  const allocations: Array<{ gatewayId: string; ip: string }> = [];
  let nextOctet = 254; // Start from .254 (back)

  for (const gateway of allGateways) {
    if (existingGatewayIds.has(gateway.id)) {
      continue; // Already has IP
    }

    // Find next available octet from back
    while (usedLastOctets.has(nextOctet) && nextOctet > 2) {
      nextOctet--;
    }

    if (nextOctet <= 2) {
      throw new Error('No more IPs available for gateways in this subnet');
    }

    const ip = `${subnetPrefix}.${nextOctet}`;
    allocations.push({ gatewayId: gateway.id, ip });
    usedLastOctets.add(nextOctet);
    nextOctet--;
  }

  // Insert allocations into database
  if (allocations.length > 0) {
    await db.insert(tunnelGatewayIps).values(
      allocations.map(a => ({
        tunnelId,
        gatewayId: a.gatewayId,
        ip: a.ip,
      }))
    );
  }

  return allocations;
}

/**
 * Allocate IPs for a new gateway in all existing tunnels
 * @param gatewayId The new gateway to allocate IPs for
 * @returns Array of allocated IPs with their tunnel IDs
 */
export async function allocateTunnelIpsForGateway(
  gatewayId: string
): Promise<Array<{ tunnelId: string; ip: string }>> {
  // Get all tunnels with subnets
  const allTunnels = await db
    .select()
    .from(tunnels)
    .where(isNotNull(tunnels.subnet));

  if (allTunnels.length === 0) {
    return [];
  }

  const allocations: Array<{ tunnelId: string; ip: string }> = [];

  for (const tunnel of allTunnels) {
    if (!tunnel.subnet) continue;

    // Parse subnet to get the prefix
    const subnetMatch = tunnel.subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/24$/);
    if (!subnetMatch) continue;
    const subnetPrefix = subnetMatch[1];

    // Get existing gateway IPs for this tunnel
    const existingIps = await db
      .select()
      .from(tunnelGatewayIps)
      .where(eq(tunnelGatewayIps.tunnelId, tunnel.id));

    // Check if this gateway already has an IP for this tunnel
    if (existingIps.some(e => e.gatewayId === gatewayId)) {
      continue;
    }

    // Find used octets
    const usedLastOctets = new Set(existingIps.map(e => {
      const match = e.ip.match(/\.(\d+)$/);
      return match && match[1] ? parseInt(match[1], 10) : 0;
    }));

    // Find next available octet from back
    let nextOctet = 254;
    while (usedLastOctets.has(nextOctet) && nextOctet > 2) {
      nextOctet--;
    }

    if (nextOctet <= 2) {
      console.warn(`No more IPs available for gateway in tunnel ${tunnel.id}`);
      continue;
    }

    const ip = `${subnetPrefix}.${nextOctet}`;
    allocations.push({ tunnelId: tunnel.id, ip });
  }

  // Insert allocations into database
  if (allocations.length > 0) {
    await db.insert(tunnelGatewayIps).values(
      allocations.map(a => ({
        tunnelId: a.tunnelId,
        gatewayId,
        ip: a.ip,
      }))
    );
  }

  return allocations;
}

/**
 * Get all gateway IPs for a tunnel
 * @param tunnelId The tunnel ID
 * @returns Array of gateway IPs with gateway info
 */
export async function getGatewayIpsForTunnel(
  tunnelId: string
): Promise<Array<{ gatewayId: string; gatewayName: string; ip: string }>> {
  const ips = await db
    .select({
      gatewayId: tunnelGatewayIps.gatewayId,
      gatewayName: gateways.name,
      ip: tunnelGatewayIps.ip,
    })
    .from(tunnelGatewayIps)
    .innerJoin(gateways, eq(tunnelGatewayIps.gatewayId, gateways.id))
    .where(eq(tunnelGatewayIps.tunnelId, tunnelId));

  return ips;
}

/**
 * Parse a subnet and extract its components
 * @param subnet Subnet in CIDR format (e.g., "10.1.0.0/24")
 * @returns Parsed subnet info or null if invalid
 */
export function parseSubnet(subnet: string): { number: number; agentIp: string } | null {
  const match = subnet.match(/^10\.(\d+)\.0\.0\/24$/);
  if (!match || !match[1]) {
    return null;
  }

  const num = parseInt(match[1], 10);
  return {
    number: num,
    agentIp: `10.${num}.0.2`,
  };
}

/**
 * Validate a subnet format
 * @param subnet Subnet string to validate
 * @returns true if valid
 */
export function isValidSubnet(subnet: string): boolean {
  return /^10\.\d{1,3}\.0\.0\/24$/.test(subnet);
}
