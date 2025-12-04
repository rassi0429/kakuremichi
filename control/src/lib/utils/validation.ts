import { z } from 'zod';

/**
 * Domain validation schema
 */
export const domainSchema = z
  .string()
  .min(1, 'Domain is required')
  .max(255, 'Domain too long')
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    'Invalid domain format'
  );

/**
 * Target validation schema (host:port)
 */
export const targetSchema = z
  .string()
  .min(1, 'Target is required')
  .max(255, 'Target too long')
  .regex(/^[a-zA-Z0-9.-]+:\d+$/, 'Target must be in format host:port');

/**
 * Name validation schema (alphanumeric with hyphens and underscores)
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(64, 'Name too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Name must contain only alphanumeric characters, hyphens, and underscores');

/**
 * IPv4 address validation schema
 */
export const ipv4Schema = z
  .string()
  .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IPv4 address')
  .refine((ip) => {
    const parts = ip.split('.');
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }, 'Invalid IPv4 address');

/**
 * Agent creation validation schema
 */
export const createAgentSchema = z.object({
  name: nameSchema,
  wireguardPublicKey: z.string().min(1).optional(),
});

/**
 * Gateway creation validation schema
 */
export const createGatewaySchema = z.object({
  name: nameSchema,
  publicIp: ipv4Schema.optional(),
  wireguardPublicKey: z.string().min(1).optional(),
  region: z.string().max(32).optional(),
});

/**
 * Tunnel creation validation schema
 */
export const createTunnelSchema = z.object({
  domain: domainSchema,
  agentId: z.string().uuid('Invalid agent ID'),
  target: targetSchema,
  description: z.string().max(500).optional(),
  // Exit Node (Outbound Proxy) settings
  httpProxyEnabled: z.boolean().optional().default(false),
  socksProxyEnabled: z.boolean().optional().default(false),
});

/**
 * Tunnel update validation schema
 */
export const updateTunnelSchema = z.object({
  domain: domainSchema.optional(),
  target: targetSchema.optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
  // Exit Node (Outbound Proxy) settings
  httpProxyEnabled: z.boolean().optional(),
  socksProxyEnabled: z.boolean().optional(),
});
