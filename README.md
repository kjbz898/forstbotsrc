# Guardian Discord Bot

A production-grade, full-featured anti-raid and moderation Discord bot designed to provide comprehensive server protection, security, and moderation tools.

## Features

- **Advanced Moderation Commands:** Ban, kick, timeout, warn, and more with detailed logging
- **Anti-Raid Protection:** Detect and prevent mass join raids with configurable thresholds and actions
- **Anti-Spam System:** Prevent message spam, mass mentions, and content floods
- **Alt Account Detection:** Identify and take action on new accounts based on account age
- **Auto-Moderation:** Filter links, invites, excessive caps, and more
- **Detailed Logging:** Comprehensive logging for all moderation actions and server events
- **Permission System:** Granular role-based permission controls for all commands
- **SQLite Database:** Persistent storage for configurations and infraction history

## Setup Instructions

1. Clone the repository
2. Create a `.env` file based on `.env.example`
3. Install dependencies with `npm install`
4. Build the project with `npm run build`
5. Start the bot with `npm start`

## Environment Variables

The following environment variables can be set in the `.env` file:

- `DISCORD_TOKEN` (Required): Your Discord bot token
- `CLIENT_ID` (Required): Your bot's application ID
- `DEV_GUILD_ID` (Optional): A specific server ID for testing commands
- `LOG_LEVEL` (Optional): Logging level (error, warn, info, debug)
- `DATABASE_PATH` (Optional): Path to the SQLite database file
- `OWNER_IDS` (Optional): Comma-separated list of user IDs who have full access

## Commands

Guardian provides over 50 commands organized into categories:

### Moderation Commands
- `/ban` - Ban a user from the server
- `/kick` - Kick a user from the server
- `/timeout` - Timeout a user for a specified duration
- `/warn` - Issue a formal warning to a user
- `/history` - View a user's moderation history
- And many more...

### Administration Commands
- `/setup` - Configure basic bot settings
- `/antiraid` - Configure anti-raid protection
- `/antispam` - Configure anti-spam settings
- `/permissions` - Manage command permissions by role
- And many more...

### Security Commands
- `/lockdown` - Lock down channels during emergency situations
- `/unlock` - Remove a channel lockdown
- `/verify` - Set up or manage verification systems
- And many more...

### Utility Commands
- `/autoresponder` - Create custom automated responses
- `/userinfo` - Get detailed information about a user
- `/serverinfo` - Get detailed information about the server
- And many more...

## Self-Hosting

This bot is designed to be easily self-hosted. You can deploy it to:

- Your own server/VPS
- Railway
- Render
- Heroku
- Any other Node.js hosting platform

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.