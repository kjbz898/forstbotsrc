import { Message, Client, Collection, EmbedBuilder } from 'discord.js';

// Store recent messages for spam detection
const recentMessages = new Collection<string, { messages: Message[], timeout: NodeJS.Timeout }>();

// Store users being rate limited to avoid multiple warnings
const rateLimitedUsers = new Set<string>();

export default {
  name: 'messageCreate',
  once: false,
  
  async execute(message: Message, client: Client) {
    // Ignore messages from bots and webhooks
    if (message.author.bot || message.webhookId) return;
    
    // Ignore DMs
    if (!message.guild) return;
    
    // Get guild configuration
    const guildConfig = client.db.get(
      `SELECT message_log_channel FROM guilds WHERE guild_id = ?`,
      { guild_id: message.guild.id }
    );
    
    // Get auto-moderation settings
    const automodConfig = client.db.get(
      `SELECT anti_spam_enabled, anti_spam_message_threshold, anti_spam_time_window, anti_spam_action,
              anti_mention_enabled, anti_mention_threshold, anti_mention_action,
              anti_link_enabled, anti_link_whitelist, anti_link_action,
              anti_invite_enabled, anti_invite_action,
              anti_caps_enabled, anti_caps_threshold, anti_caps_min_length, anti_caps_action,
              automod_log_channel
       FROM guild_configs WHERE guild_id = ?`,
      { guild_id: message.guild.id }
    );
    
    // Check for auto responses
    if (message.content) {
      checkAutoResponses(message, client);
    }
    
    // Apply auto-moderation if enabled
    if (automodConfig) {
      const modActions = [];
      
      // Check for spam if enabled
      if (automodConfig.anti_spam_enabled) {
        const spamResult = await checkSpam(message, client, automodConfig);
        if (spamResult) modActions.push(spamResult);
      }
      
      // Check for mass mentions if enabled
      if (automodConfig.anti_mention_enabled && message.mentions.users.size > 0) {
        const mentionResult = await checkMassMentions(message, client, automodConfig);
        if (mentionResult) modActions.push(mentionResult);
      }
      
      // Check for links if enabled
      if (automodConfig.anti_link_enabled && message.content.includes('http')) {
        const linkResult = await checkLinks(message, client, automodConfig);
        if (linkResult) modActions.push(linkResult);
      }
      
      // Check for Discord invites if enabled
      if (automodConfig.anti_invite_enabled && 
          (message.content.includes('discord.gg/') || 
           message.content.includes('discordapp.com/invite/'))) {
        const inviteResult = await checkInvites(message, client, automodConfig);
        if (inviteResult) modActions.push(inviteResult);
      }
      
      // Check for excessive caps if enabled
      if (automodConfig.anti_caps_enabled && message.content.length >= automodConfig.anti_caps_min_length) {
        const capsResult = await checkCaps(message, client, automodConfig);
        if (capsResult) modActions.push(capsResult);
      }
      
      // If there were any moderation actions, log them
      if (modActions.length > 0 && automodConfig.automod_log_channel) {
        try {
          const logChannel = await message.guild.channels.fetch(automodConfig.automod_log_channel);
          
          if (logChannel?.isTextBased()) {
            // Create automod log embed
            const automodEmbed = new EmbedBuilder()
              .setTitle('AutoMod Action')
              .setDescription(`User: ${message.author.tag} (${message.author.id})`)
              .setColor(0xf1c40f) // Yellow
              .addFields(
                { 
                  name: 'Channel', 
                  value: `<#${message.channel.id}>`,
                  inline: true 
                },
                { 
                  name: 'Actions Taken', 
                  value: modActions.join('\n'),
                  inline: false 
                }
              )
              .setTimestamp();
            
            // Add message content snippet if available
            if (message.content) {
              const contentPreview = message.content.length > 1024 
                ? message.content.substring(0, 1021) + '...' 
                : message.content;
              
              automodEmbed.addFields({
                name: 'Message Content',
                value: contentPreview,
                inline: false
              });
            }
            
            await logChannel.send({ embeds: [automodEmbed] });
          }
        } catch (error) {
          client.logger.error(`Error sending automod log in ${message.guild.id}:`, error);
        }
      }
    }
    
    // Log messages if configured
    if (guildConfig?.message_log_channel && message.content) {
      try {
        // Don't log messages in the log channel itself to avoid loops
        if (message.channel.id === guildConfig.message_log_channel) return;
        
        const logChannel = await message.guild.channels.fetch(guildConfig.message_log_channel);
        
        if (logChannel?.isTextBased()) {
          // Skip logging simple bot command messages
          if (message.content.startsWith('!') || message.content.startsWith('/')) return;
          
          // Skip very short messages
          if (message.content.length < 5) return;
          
          // Create message log embed
          const messageEmbed = new EmbedBuilder()
            .setAuthor({
              name: message.author.tag,
              iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content)
            .addFields(
              { 
                name: 'Channel', 
                value: `<#${message.channel.id}>`,
                inline: true 
              },
              { 
                name: 'User ID', 
                value: message.author.id,
                inline: true 
              }
            )
            .setColor(0x3498db) // Blue
            .setTimestamp();
          
          // Add attachment info if present
          if (message.attachments.size > 0) {
            const attachmentList = message.attachments.map(a => `[${a.name}](${a.url})`).join('\n');
            messageEmbed.addFields({
              name: 'Attachments',
              value: attachmentList.substring(0, 1024) // Limit to 1024 chars
            });
          }
          
          await logChannel.send({ embeds: [messageEmbed] });
        }
      } catch (error) {
        client.logger.error(`Error logging message in ${message.guild.id}:`, error);
      }
    }
  },
};

// Check for auto responses
async function checkAutoResponses(message: Message, client: any) {
  try {
    // Get auto responses for this guild
    const autoResponses = client.db.query(
      'SELECT trigger, response, is_regex FROM auto_responses WHERE guild_id = ?',
      { guild_id: message.guild!.id }
    );
    
    if (!autoResponses || autoResponses.length === 0) return;
    
    for (const response of autoResponses) {
      let shouldRespond = false;
      
      if (response.is_regex) {
        // Regex match
        try {
          const regex = new RegExp(response.trigger, 'i');
          shouldRespond = regex.test(message.content);
        } catch (error) {
          client.logger.error(`Invalid regex in auto response: ${response.trigger}`, error);
        }
      } else {
        // Plain text match
        shouldRespond = message.content.toLowerCase().includes(response.trigger.toLowerCase());
      }
      
      if (shouldRespond) {
        try {
          await message.channel.send(response.response);
          break; // Only send the first matching response
        } catch (error) {
          client.logger.error(`Error sending auto response in ${message.guild!.id}:`, error);
        }
      }
    }
  } catch (error) {
    client.logger.error(`Error checking auto responses in ${message.guild!.id}:`, error);
  }
}

// Check for spam
async function checkSpam(message: Message, client: any, config: any): Promise<string | null> {
  try {
    const key = `${message.guild!.id}-${message.author.id}`;
    
    // Check if user is already being rate limited
    if (rateLimitedUsers.has(key)) return null;
    
    // Get or create user's recent messages
    if (!recentMessages.has(key)) {
      recentMessages.set(key, {
        messages: [message],
        timeout: setTimeout(() => {
          recentMessages.delete(key);
        }, config.anti_spam_time_window)
      });
      return null;
    }
    
    // Add message to recent messages
    const userMessages = recentMessages.get(key)!;
    userMessages.messages.push(message);
    
    // Check if user has sent too many messages too quickly
    if (userMessages.messages.length >= config.anti_spam_message_threshold) {
      // Clear the timeout and reset
      clearTimeout(userMessages.timeout);
      recentMessages.delete(key);
      
      // Mark user as rate limited temporarily
      rateLimitedUsers.add(key);
      setTimeout(() => {
        rateLimitedUsers.delete(key);
      }, 10000); // Rate limit for 10 seconds
      
      // Take action based on configuration
      let actionTaken = 'None';
      
      switch (config.anti_spam_action) {
        case 'delete':
          // Delete the messages
          for (const msg of userMessages.messages) {
            await msg.delete().catch(() => {});
          }
          actionTaken = 'Messages deleted';
          break;
          
        case 'warn':
          // Warn the user
          await message.reply(`Please slow down! You're sending messages too quickly.`)
            .catch(() => {});
          
          // Record warning in database
          const now = Date.now();
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'warn',
              reason: 'AutoMod: Message spam detected',
              created_at: now
            }
          );
          actionTaken = 'User warned';
          break;
          
        case 'mute':
          // Timeout the user
          const member = await message.guild!.members.fetch(message.author.id);
          await member.timeout(5 * 60 * 1000, 'AutoMod: Message spam detected')
            .catch(() => {});
            
          // Record timeout in database
          const nowMute = Date.now();
          const expiresAt = nowMute + (5 * 60 * 1000);
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, duration, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'timeout',
              reason: 'AutoMod: Message spam detected',
              duration: 5 * 60 * 1000,
              expires_at: expiresAt,
              created_at: nowMute
            }
          );
          actionTaken = 'User timed out for 5 minutes';
          break;
          
        case 'kick':
          // Kick the user
          const memberToKick = await message.guild!.members.fetch(message.author.id);
          await memberToKick.kick('AutoMod: Message spam detected')
            .catch(() => {});
            
          // Record kick in database
          const nowKick = Date.now();
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'kick',
              reason: 'AutoMod: Message spam detected',
              created_at: nowKick
            }
          );
          actionTaken = 'User kicked';
          break;
      }
      
      return `Spam detected: ${actionTaken}`;
    }
    
    return null;
  } catch (error) {
    client.logger.error(`Error in spam detection for ${message.guild!.id}:`, error);
    return null;
  }
}

// Check for mass mentions
async function checkMassMentions(message: Message, client: any, config: any): Promise<string | null> {
  try {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    
    if (mentionCount >= config.anti_mention_threshold) {
      // Take action based on configuration
      let actionTaken = 'None';
      
      switch (config.anti_mention_action) {
        case 'delete':
          // Delete the message
          await message.delete().catch(() => {});
          actionTaken = 'Message deleted';
          break;
          
        case 'warn':
          // Warn the user
          await message.reply(`Please avoid mass mentioning users or roles.`)
            .catch(() => {});
          
          // Record warning in database
          const now = Date.now();
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'warn',
              reason: 'AutoMod: Mass mentions detected',
              created_at: now
            }
          );
          actionTaken = 'User warned';
          break;
          
        case 'mute':
          // Timeout the user
          const member = await message.guild!.members.fetch(message.author.id);
          await member.timeout(10 * 60 * 1000, 'AutoMod: Mass mentions detected')
            .catch(() => {});
            
          // Record timeout in database
          const nowMute = Date.now();
          const expiresAt = nowMute + (10 * 60 * 1000);
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, duration, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'timeout',
              reason: 'AutoMod: Mass mentions detected',
              duration: 10 * 60 * 1000,
              expires_at: expiresAt,
              created_at: nowMute
            }
          );
          actionTaken = 'User timed out for 10 minutes';
          break;
      }
      
      return `Mass mentions detected (${mentionCount}): ${actionTaken}`;
    }
    
    return null;
  } catch (error) {
    client.logger.error(`Error in mention detection for ${message.guild!.id}:`, error);
    return null;
  }
}

// Check for links
async function checkLinks(message: Message, client: any, config: any): Promise<string | null> {
  try {
    // Check if message contains a link
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = message.content.match(urlRegex);
    
    if (matches && matches.length > 0) {
      // Check against whitelist if available
      if (config.anti_link_whitelist) {
        const whitelist = config.anti_link_whitelist.split(',').map((domain: string) => domain.trim());
        
        // Check if all links are whitelisted
        const hasBlockedLink = matches.some((url: string) => {
          try {
            const urlObj = new URL(url);
            return !whitelist.some(domain => urlObj.hostname.includes(domain));
          } catch {
            return true; // If URL parsing fails, consider it blocked
          }
        });
        
        if (!hasBlockedLink) return null;
      }
      
      // Take action based on configuration
      let actionTaken = 'None';
      
      switch (config.anti_link_action) {
        case 'delete':
          // Delete the message
          await message.delete().catch(() => {});
          actionTaken = 'Message deleted';
          break;
          
        case 'warn':
          // Warn the user
          await message.reply(`Links are not allowed in this server.`)
            .catch(() => {});
          
          // Record warning in database
          const now = Date.now();
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'warn',
              reason: 'AutoMod: Unauthorized links detected',
              created_at: now
            }
          );
          actionTaken = 'User warned';
          break;
      }
      
      return `Unauthorized links detected: ${actionTaken}`;
    }
    
    return null;
  } catch (error) {
    client.logger.error(`Error in link detection for ${message.guild!.id}:`, error);
    return null;
  }
}

// Check for Discord invites
async function checkInvites(message: Message, client: any, config: any): Promise<string | null> {
  try {
    // Check if message contains a Discord invite
    const inviteRegex = /(discord\.gg\/|discordapp\.com\/invite\/)[a-zA-Z0-9]+/g;
    const matches = message.content.match(inviteRegex);
    
    if (matches && matches.length > 0) {
      // Take action based on configuration
      let actionTaken = 'None';
      
      switch (config.anti_invite_action) {
        case 'delete':
          // Delete the message
          await message.delete().catch(() => {});
          actionTaken = 'Message deleted';
          break;
          
        case 'warn':
          // Warn the user
          await message.reply(`Discord invites are not allowed in this server.`)
            .catch(() => {});
          
          // Record warning in database
          const now = Date.now();
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'warn',
              reason: 'AutoMod: Discord invite detected',
              created_at: now
            }
          );
          actionTaken = 'User warned';
          break;
      }
      
      return `Discord invite detected: ${actionTaken}`;
    }
    
    return null;
  } catch (error) {
    client.logger.error(`Error in invite detection for ${message.guild!.id}:`, error);
    return null;
  }
}

// Check for excessive caps
async function checkCaps(message: Message, client: any, config: any): Promise<string | null> {
  try {
    // Count uppercase characters
    let uppercaseCount = 0;
    let totalLetters = 0;
    
    for (const char of message.content) {
      if (/[a-zA-Z]/.test(char)) {
        totalLetters++;
        if (char === char.toUpperCase()) {
          uppercaseCount++;
        }
      }
    }
    
    // Skip if not enough letters
    if (totalLetters < config.anti_caps_min_length) return null;
    
    // Calculate percentage of caps
    const capsPercentage = (uppercaseCount / totalLetters) * 100;
    
    if (capsPercentage >= config.anti_caps_threshold) {
      // Take action based on configuration
      let actionTaken = 'None';
      
      switch (config.anti_caps_action) {
        case 'delete':
          // Delete the message
          await message.delete().catch(() => {});
          actionTaken = 'Message deleted';
          break;
          
        case 'warn':
          // Warn the user
          await message.reply(`Please avoid using excessive caps.`)
            .catch(() => {});
          
          // Record warning in database
          const now = Date.now();
          client.db.run(
            `INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            {
              guild_id: message.guild!.id,
              user_id: message.author.id,
              moderator_id: client.user!.id,
              action_type: 'warn',
              reason: 'AutoMod: Excessive caps detected',
              created_at: now
            }
          );
          actionTaken = 'User warned';
          break;
      }
      
      return `Excessive caps detected (${Math.round(capsPercentage)}%): ${actionTaken}`;
    }
    
    return null;
  } catch (error) {
    client.logger.error(`Error in caps detection for ${message.guild!.id}:`, error);
    return null;
  }
}