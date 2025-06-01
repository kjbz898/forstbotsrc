import { GuildMember, CommandInteraction, Role, PermissionFlagsBits } from 'discord.js';
import type { Client } from 'discord.js';

/**
 * Checks if the member has permission to use a command, considering:
 * 1. Bot owner status
 * 2. Server owner status
 * 3. Administrator permission
 * 4. Custom role permissions from database
 */
export async function canUseCommand(
  client: Client,
  member: GuildMember,
  commandName: string
): Promise<boolean> {
  // Bot owner can use all commands
  const ownerIds = process.env.OWNER_IDS?.split(',') || [];
  if (ownerIds.includes(member.id)) return true;
  
  // Server owner can use all commands
  if (member.guild.ownerId === member.id) return true;
  
  // Administrators can use all commands unless specifically restricted
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    // Check if this command is restricted even for admins
    const isAdminRestricted = await isCommandRestrictedForAdmins(client, member.guild.id, commandName);
    if (!isAdminRestricted) return true;
  }
  
  // Check custom role permissions
  const hasPermission = await checkRolePermissions(client, member, commandName);
  return hasPermission;
}

/**
 * Check if a command is restricted even for administrators
 */
async function isCommandRestrictedForAdmins(
  client: Client, 
  guildId: string, 
  commandName: string
): Promise<boolean> {
  try {
    const result = client.db.get(
      'SELECT restricted_for_admins FROM command_restrictions WHERE guild_id = ? AND command = ?',
      { guild_id: guildId, command: commandName }
    );
    
    return result?.restricted_for_admins === 1;
  } catch (error) {
    client.logger.error('Error checking admin restriction:', error);
    return false;
  }
}

/**
 * Check if a member has permission to use a command based on their roles
 */
async function checkRolePermissions(
  client: Client,
  member: GuildMember,
  commandName: string
): Promise<boolean> {
  try {
    // Get all of the member's roles
    const memberRoles = member.roles.cache.map(role => role.id);
    
    // Check if any of the member's roles have permission for this command
    const rolePermissions = client.db.query(
      'SELECT role_id, allowed FROM role_permissions WHERE guild_id = ? AND command = ? AND role_id IN (?)',
      { 
        guild_id: member.guild.id, 
        command: commandName,
        role_id: memberRoles.join(',')
      }
    );
    
    // If any role is explicitly allowed, return true
    for (const perm of rolePermissions) {
      if (perm.allowed === 1) return true;
    }
    
    // Check if there are any explicit permissions set for this command
    const anyPermissions = client.db.get(
      'SELECT COUNT(*) as count FROM role_permissions WHERE guild_id = ? AND command = ?',
      { guild_id: member.guild.id, command: commandName }
    );
    
    // If no permissions are set, allow by default for mods (with moderate members perm)
    if (!anyPermissions || anyPermissions.count === 0) {
      // For moderation commands, require MODERATE_MEMBERS permission by default
      const command = client.commands.get(commandName);
      if (command?.category === 'moderation') {
        return member.permissions.has(PermissionFlagsBits.ModerateMembers);
      }
      
      // For admin commands, require MANAGE_GUILD permission by default
      if (command?.category === 'admin') {
        return member.permissions.has(PermissionFlagsBits.ManageGuild);
      }
      
      // For utility and other commands, allow by default
      return true;
    }
    
    // If explicit permissions are set but none matched, deny
    return false;
  } catch (error) {
    client.logger.error('Error checking role permissions:', error);
    return false;
  }
}

/**
 * Sets permission for a role to use a command
 */
export async function setRolePermission(
  client: Client,
  guildId: string,
  roleId: string,
  commandName: string,
  allowed: boolean
): Promise<boolean> {
  try {
    const now = Date.now();
    
    client.db.run(
      `INSERT INTO role_permissions (guild_id, role_id, command, allowed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, role_id, command) 
       DO UPDATE SET allowed = ?, updated_at = ?`,
      { 
        guild_id: guildId, 
        role_id: roleId, 
        command: commandName, 
        allowed: allowed ? 1 : 0,
        created_at: now,
        updated_at: now,
        allowed_update: allowed ? 1 : 0,
        updated_at_update: now
      }
    );
    
    return true;
  } catch (error) {
    client.logger.error('Error setting role permission:', error);
    return false;
  }
}

/**
 * Get all role permissions for a command in a guild
 */
export function getRolePermissions(
  client: Client,
  guildId: string,
  commandName: string
): { roleId: string; allowed: boolean }[] {
  try {
    const permissions = client.db.query(
      'SELECT role_id, allowed FROM role_permissions WHERE guild_id = ? AND command = ?',
      { guild_id: guildId, command: commandName }
    );
    
    return permissions.map((perm: any) => ({
      roleId: perm.role_id,
      allowed: perm.allowed === 1
    }));
  } catch (error) {
    client.logger.error('Error getting role permissions:', error);
    return [];
  }
}

/**
 * Check if a member can target another member with a moderation command
 */
export function canTargetMember(
  executor: GuildMember,
  target: GuildMember
): boolean {
  // Cannot target yourself
  if (executor.id === target.id) return false;
  
  // Cannot target the server owner
  if (target.id === target.guild.ownerId) return false;
  
  // Cannot target members with higher roles
  if (target.roles.highest.position >= executor.roles.highest.position) return false;
  
  // Cannot target members that the bot cannot target
  const botMember = executor.guild.members.me;
  if (!botMember || target.roles.highest.position >= botMember.roles.highest.position) return false;
  
  return true;
}