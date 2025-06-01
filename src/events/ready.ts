import { Client, ActivityType } from 'discord.js';

export default {
  name: 'ready',
  once: true,
  
  async execute(client: Client) {
    // Set bot presence
    client.user?.setPresence({
      activities: [{ name: 'for raids', type: ActivityType.Watching }],
      status: 'online',
    });
    
    client.logger.system(`Bot is online as ${client.user?.tag}`);
    client.logger.system(`Currently in ${client.guilds.cache.size} servers`);
    
    // Start any background tasks
    initBackgroundTasks(client);
  },
};

function initBackgroundTasks(client: any) {
  // Check for expired timeouts every minute
  setInterval(() => checkExpiredTimeouts(client), 60 * 1000);
  
  // Cleanup raid logs every hour
  setInterval(() => cleanupRaidLogs(client), 60 * 60 * 1000);
}

async function checkExpiredTimeouts(client: any) {
  try {
    const now = Date.now();
    
    // Get all expired timeouts
    const expiredTimeouts = client.db.query(
      `SELECT guild_id, user_id, action_id
       FROM mod_actions
       WHERE action_type = 'timeout' AND expires_at <= ? AND expires_at > 0`,
      { expires_at: now }
    );
    
    // Nothing to do
    if (!expiredTimeouts || expiredTimeouts.length === 0) return;
    
    client.logger.debug(`Found ${expiredTimeouts.length} expired timeouts`);
    
    // Process each expired timeout
    for (const timeout of expiredTimeouts) {
      try {
        // Get the guild
        const guild = await client.guilds.fetch(timeout.guild_id).catch(() => null);
        if (!guild) continue;
        
        // Get the member
        const member = await guild.members.fetch(timeout.user_id).catch(() => null);
        if (!member) continue;
        
        // Remove the timeout if still applied
        if (member.communicationDisabledUntil) {
          await member.timeout(null, 'Timeout expired');
          client.logger.debug(`Removed timeout for ${member.user.tag} in ${guild.name}`);
        }
        
        // Update the database to mark this as processed (set expires_at to 0)
        client.db.run(
          'UPDATE mod_actions SET expires_at = 0 WHERE action_id = ?',
          { action_id: timeout.action_id }
        );
      } catch (error) {
        client.logger.error(`Error processing expired timeout:`, error);
      }
    }
  } catch (error) {
    client.logger.error('Error checking expired timeouts:', error);
  }
}

async function cleanupRaidLogs(client: any) {
  try {
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // Delete resolved raid logs older than one week
    client.db.run(
      'DELETE FROM raid_logs WHERE is_resolved = 1 AND created_at < ?',
      { created_at: oneWeekAgo }
    );
    
    // Mark old unresolved raids as resolved
    client.db.run(
      'UPDATE raid_logs SET is_resolved = 1 WHERE is_resolved = 0 AND created_at < ?',
      { created_at: oneWeekAgo }
    );
  } catch (error) {
    client.logger.error('Error cleaning up raid logs:', error);
  }
}