import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, CommandInteraction, GuildMember, Role, User, Message } from 'discord.js';
import ms from 'ms';

/**
 * Check if a member has a specific permission
 */
export function hasPermission(member: GuildMember, permission: bigint): boolean {
  return member.permissions.has(permission);
}

/**
 * Check if a member has a specific role
 */
export function hasRole(member: GuildMember, roleId: string): boolean {
  return member.roles.cache.has(roleId);
}

/**
 * Check if a user is a bot owner
 */
export function isOwner(userId: string): boolean {
  const ownerIds = process.env.OWNER_IDS?.split(',') || [];
  return ownerIds.includes(userId);
}

/**
 * Parse duration string to milliseconds
 */
export function parseDuration(duration: string): number | null {
  try {
    return ms(duration);
  } catch (error) {
    return null;
  }
}

/**
 * Format milliseconds to human-readable duration
 */
export function formatDuration(milliseconds: number): string {
  return ms(milliseconds, { long: true });
}

/**
 * Create a basic embed with consistent styling
 */
export function createEmbed(options: {
  title?: string;
  description?: string;
  color?: number;
  footer?: string;
  timestamp?: boolean;
  author?: User;
}): EmbedBuilder {
  const embed = new EmbedBuilder();
  
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  
  embed.setColor(options.color || 0x3498db); // Default blue color
  
  if (options.footer) embed.setFooter({ text: options.footer });
  if (options.timestamp) embed.setTimestamp();
  
  if (options.author) {
    embed.setAuthor({
      name: options.author.tag,
      iconURL: options.author.displayAvatarURL()
    });
  }
  
  return embed;
}

/**
 * Create a success embed
 */
export function successEmbed(description: string, options: {
  title?: string;
  footer?: string;
  timestamp?: boolean;
  author?: User;
} = {}): EmbedBuilder {
  return createEmbed({
    title: options.title || 'Success',
    description,
    color: 0x2ecc71, // Green
    footer: options.footer,
    timestamp: options.timestamp,
    author: options.author
  });
}

/**
 * Create an error embed
 */
export function errorEmbed(description: string, options: {
  title?: string;
  footer?: string;
  timestamp?: boolean;
  author?: User;
} = {}): EmbedBuilder {
  return createEmbed({
    title: options.title || 'Error',
    description,
    color: 0xe74c3c, // Red
    footer: options.footer,
    timestamp: options.timestamp,
    author: options.author
  });
}

/**
 * Create a warning embed
 */
export function warningEmbed(description: string, options: {
  title?: string;
  footer?: string;
  timestamp?: boolean;
  author?: User;
} = {}): EmbedBuilder {
  return createEmbed({
    title: options.title || 'Warning',
    description,
    color: 0xf39c12, // Yellow/Orange
    footer: options.footer,
    timestamp: options.timestamp,
    author: options.author
  });
}

/**
 * Create an info embed
 */
export function infoEmbed(description: string, options: {
  title?: string;
  footer?: string;
  timestamp?: boolean;
  author?: User;
} = {}): EmbedBuilder {
  return createEmbed({
    title: options.title || 'Information',
    description,
    color: 0x3498db, // Blue
    footer: options.footer,
    timestamp: options.timestamp,
    author: options.author
  });
}

/**
 * Create a log embed
 */
export function logEmbed(action: string, options: {
  user?: User;
  target?: User;
  reason?: string;
  duration?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: boolean;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${action}`)
    .setColor(options.color || 0x3498db);
  
  if (options.user && options.target) {
    embed.setDescription(`**User:** ${options.target.tag} (${options.target.id})\n**Moderator:** ${options.user.tag} (${options.user.id})`);
  }
  
  if (options.reason) {
    embed.addFields({ name: 'Reason', value: options.reason });
  }
  
  if (options.duration) {
    embed.addFields({ name: 'Duration', value: options.duration });
  }
  
  if (options.fields) {
    embed.addFields(options.fields);
  }
  
  if (options.timestamp !== false) {
    embed.setTimestamp();
  }
  
  return embed;
}

/**
 * Send a temporary message that auto-deletes
 */
export async function sendTemporaryMessage(
  interaction: CommandInteraction,
  content: string,
  duration: number = 5000
): Promise<void> {
  try {
    const reply = await interaction.reply({ content, ephemeral: true });
    
    setTimeout(() => {
      if (interaction.replied || interaction.deferred) {
        interaction.deleteReply().catch(() => {});
      }
    }, duration);
  } catch (error) {
    console.error('Failed to send temporary message:', error);
  }
}

/**
 * Add a cooldown to a command
 */
export function setCooldown(
  client: any,
  userId: string,
  commandName: string,
  cooldownAmount: number
): void {
  if (!client.cooldowns.has(commandName)) {
    client.cooldowns.set(commandName, new Map());
  }
  
  const timestamps = client.cooldowns.get(commandName);
  timestamps.set(userId, Date.now());
  
  setTimeout(() => timestamps.delete(userId), cooldownAmount);
}

/**
 * Check if a command is on cooldown
 * Returns remaining time in seconds or 0 if not on cooldown
 */
export function checkCooldown(
  client: any,
  userId: string,
  commandName: string,
  cooldownAmount: number
): number {
  if (!client.cooldowns.has(commandName)) {
    client.cooldowns.set(commandName, new Map());
    return 0;
  }
  
  const timestamps = client.cooldowns.get(commandName);
  if (!timestamps.has(userId)) return 0;
  
  const expirationTime = timestamps.get(userId) + cooldownAmount;
  const now = Date.now();
  
  if (now < expirationTime) {
    const timeLeft = (expirationTime - now) / 1000;
    return timeLeft;
  }
  
  return 0;
}