# Pascal

> [!WARNING]
> This bot is not meant to be hosted as a public application! If you host this bot, make sure the application is set to private so only authorized users can add it to their server.

A Discord ban-sync bot built with [cosmiolotl/kuiper](https://github.com/cosmiolotl/kuiper).


## Commands
`/sync setup` - Sets up a channel to be used in your guild as a logging channel

`/sync follow` - Start receiving alerts from any guild in your bot's network

`/sync unfollow` - Stop receiving alerts from a guild that your guild is following

`/sync graph` - Show all subscribed and subscribing servers

## Run

Requires Node.js 24+, npm, and Git.

```powershell
npm ci
Copy-Item .env.example .env # set the required variables
npm start
```

## Convenience

The VPS I deploy Pascal to is accessed via SSH. For user convenience there is a pglite socket that is opened and can be SSHed into.
