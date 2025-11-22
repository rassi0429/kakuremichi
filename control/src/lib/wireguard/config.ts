import { db, agents, gateways } from '../db';
import { eq } from 'drizzle-orm';

/**
 * Generate WireGuard configuration for a Gateway
 * @param gatewayId Gateway ID
 * @returns WireGuard configuration string
 */
export async function generateGatewayWireguardConfig(
  gatewayId: string
): Promise<string> {
  // Get gateway info
  const gateway = await db
    .select()
    .from(gateways)
    .where(eq(gateways.id, gatewayId))
    .limit(1);

  if (gateway.length === 0) {
    throw new Error('Gateway not found');
  }

  const gw = gateway[0];

  // Get all agents to create peers
  const allAgents = await db.select().from(agents);

  // Build WireGuard config
  let config = `[Interface]\n`;
  config += `# Gateway: ${gw.name}\n`;
  config += `PrivateKey = <GATEWAY_PRIVATE_KEY>\n`;
  config += `ListenPort = 51820\n`;

  // Add addresses for all agent subnets
  const addresses = allAgents.map((agent) => {
    // Extract subnet prefix (e.g., "10.1.0" from "10.1.0.0/24")
    const subnetMatch = agent.subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/24$/);
    if (!subnetMatch) return null;
    // Gateway gets .1 in each agent's subnet
    return `${subnetMatch[1]}.1/24`;
  }).filter((addr): addr is string => addr !== null);

  config += `Address = ${addresses.join(', ')}\n`;
  config += `\n`;

  // Add peers (Agents)
  for (const agent of allAgents) {
    config += `[Peer]\n`;
    config += `# Agent: ${agent.name}\n`;
    config += `PublicKey = ${agent.wireguardPublicKey}\n`;
    config += `AllowedIPs = ${agent.subnet}\n`;
    config += `\n`;
  }

  return config;
}

/**
 * Generate WireGuard configuration for an Agent
 * @param agentId Agent ID
 * @returns WireGuard configuration string
 */
export async function generateAgentWireguardConfig(
  agentId: string
): Promise<string> {
  // Get agent info
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (agent.length === 0) {
    throw new Error('Agent not found');
  }

  const ag = agent[0];

  // Get all gateways to create peers
  const allGateways = await db.select().from(gateways);

  // Build WireGuard config
  let config = `[Interface]\n`;
  config += `# Agent: ${ag.name}\n`;
  config += `PrivateKey = <AGENT_PRIVATE_KEY>\n`;
  config += `Address = ${ag.virtualIp}/24\n`;
  config += `\n`;

  // Add peers (Gateways)
  let peerIndex = 1;
  for (const gateway of allGateways) {
    // Extract subnet prefix from agent's subnet
    const subnetMatch = ag.subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/24$/);
    if (!subnetMatch) continue;

    const gatewayIp = `${subnetMatch[1]}.${peerIndex}`;

    config += `[Peer]\n`;
    config += `# Gateway: ${gateway.name}\n`;
    config += `PublicKey = ${gateway.wireguardPublicKey}\n`;
    config += `Endpoint = ${gateway.publicIp}:51820\n`;
    config += `AllowedIPs = ${gatewayIp}/32\n`;
    config += `PersistentKeepalive = 25\n`;
    config += `\n`;

    peerIndex++;
  }

  return config;
}

/**
 * Get WireGuard configuration data for Gateway (structured)
 */
export async function getGatewayWireguardData(gatewayId: string) {
  const gateway = await db
    .select()
    .from(gateways)
    .where(eq(gateways.id, gatewayId))
    .limit(1);

  if (gateway.length === 0) {
    throw new Error('Gateway not found');
  }

  const allAgents = await db.select().from(agents);

  return {
    gateway: gateway[0],
    peers: allAgents.map((agent) => ({
      publicKey: agent.wireguardPublicKey,
      allowedIPs: agent.subnet,
      name: agent.name,
    })),
  };
}

/**
 * Get WireGuard configuration data for Agent (structured)
 */
export async function getAgentWireguardData(agentId: string) {
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (agent.length === 0) {
    throw new Error('Agent not found');
  }

  const allGateways = await db.select().from(gateways);

  return {
    agent: agent[0],
    peers: allGateways.map((gateway, index) => {
      const subnetMatch = agent[0].subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/24$/);
      const gatewayIp = subnetMatch
        ? `${subnetMatch[1]}.${index + 1}`
        : '10.0.0.1';

      return {
        publicKey: gateway.wireguardPublicKey,
        endpoint: `${gateway.publicIp}:51820`,
        allowedIPs: `${gatewayIp}/32`,
        name: gateway.name,
      };
    }),
  };
}
