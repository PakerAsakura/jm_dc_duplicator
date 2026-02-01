const Discord = require('discord.js')

class DiscordDuplicator {
  constructor(botToken, sourceGuildId, targetGuildId, progressCallback) {
    this.botToken = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`
    this.sourceGuildId = sourceGuildId
    this.targetGuildId = targetGuildId
    this.progressCallback = progressCallback
    this.isCancelled = false
    this.isComplete = false
    this.logs = []
    this.currentStep = ''
    this.startTime = null
    this.totalItems = 0
    this.processedItems = 0

    this.client = new Discord.Client({
      intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.GuildMembers,
      ],
      partials: [],
    })

    // Enhanced error handling
    this.client.on('error', (error) => {
      this.addLog(`Discord client error: ${error.message}`, 'error')
    })

    this.client.on('warn', (warning) => {
      this.addLog(`Discord client warning: ${warning}`, 'warning')
    })

    this.client.on('rateLimit', (rateLimitInfo) => {
      this.addLog(`Rate limited: ${rateLimitInfo.timeout}ms timeout`, 'warning')
    })

    this.client.on('ready', this.onReady.bind(this))
  }

  sendProgress(data) {
    if (this.progressCallback && !this.isCancelled) {
      this.progressCallback(data)
    }
  }

  addLog(message, type = 'info') {
    const timestamp = new Date().toISOString()
    const logEntry = { timestamp, message, type }
    this.logs.push(logEntry)

    // Send log immediately for real-time updates
    if (this.progressCallback && !this.isCancelled) {
      this.sendProgress({ type: 'log', ...logEntry })
    }

    // Also log to console for debugging
    console.log(`[DiscordDuplicator] ${type.toUpperCase()}: ${message}`)
  }

  updateProgress(step, percentage) {
    this.currentStep = step
    this.sendProgress({
      type: 'progress',
      step,
      percentage: Math.min(100, Math.max(0, percentage)),
    })
  }

  updateDetailedProgress(current, total, itemName) {
    const percentage = total > 0 ? Math.floor((current / total) * 100) : 0
    this.sendProgress({
      type: 'detailed_progress',
      current,
      total,
      itemName,
      percentage,
    })
  }

  cancel() {
    this.isCancelled = true
    this.addLog('Process cancelled by user', 'warning')
    if (this.client && this.client.isReady()) {
      this.client
        .destroy()
        .then(() => this.addLog('Discord client disconnected', 'info'))
        .catch((err) =>
          this.addLog(`Error disconnecting: ${err.message}`, 'error'),
        )
    }

    if (this.reject) {
      this.reject(new Error('Process cancelled by user'))
    }
  }

  async startDuplication() {
    try {
      this.startTime = Date.now()
      this.updateProgress('Validating inputs', 5)
      this.addLog('Starting duplication process...')

      // Validate inputs
      if (!this.botToken || this.botToken.length < 10) {
        throw new Error('Invalid bot token provided')
      }

      if (!this.sourceGuildId || !this.targetGuildId) {
        throw new Error('Guild IDs are required')
      }

      this.updateProgress('Connecting to Discord', 10)
      this.addLog('Connecting to Discord API...')

      // Set timeout for Discord login
      const loginPromise = this.client.login(this.botToken)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Discord login timeout (30 seconds)')),
          30000,
        ),
      )

      await Promise.race([loginPromise, timeoutPromise])

      return new Promise((resolve, reject) => {
        this.resolve = resolve
        this.reject = reject
      })
    } catch (error) {
      this.addLog(`Connection failed: ${error.message}`, 'error')

      if (this.client) {
        this.client.destroy().catch(() => {})
      }

      throw error
    }
  }

  async onReady() {
    try {
      const elapsed = Date.now() - this.startTime
      this.addLog(`Logged in as ${this.client.user.tag} (${elapsed}ms)`)
      this.addLog(`Connected to ${this.client.guilds.cache.size} servers`)

      await this.fullDuplicateProcess()

      if (!this.isCancelled) {
        this.addLog('Duplication completed successfully')
        this.updateProgress('Completed', 100)

        const totalTime = Date.now() - this.startTime
        this.addLog(
          `Total process time: ${Math.round(totalTime / 1000)} seconds`,
        )

        if (this.resolve) {
          this.resolve({
            success: true,
            logs: this.logs,
            duration: totalTime,
          })
        }
      }
    } catch (error) {
      this.addLog(`Duplication failed: ${error.message}`, 'error')
      if (this.reject && !this.isCancelled) {
        this.reject(error)
      }
    } finally {
      if (this.client && this.client.isReady()) {
        try {
          await this.client.destroy()
          this.addLog('Discord client disconnected', 'info')
        } catch (error) {
          this.addLog(`Error during disconnect: ${error.message}`, 'warning')
        }
      }
    }
  }

  async fullDuplicateProcess() {
    if (this.isCancelled) return

    try {
      this.updateProgress('Locating servers', 15)
      this.addLog('Fetching server information...')

      // Fetch guilds to ensure cache is populated
      await this.client.guilds.fetch()

      const sourceGuild = await this.client.guilds
        .fetch(this.sourceGuildId)
        .catch(() => null)
      const targetGuild = await this.client.guilds
        .fetch(this.targetGuildId)
        .catch(() => null)

      if (!sourceGuild) {
        throw new Error(
          `Source server with ID ${this.sourceGuildId} not found or bot doesn't have access.`,
        )
      }
      if (!targetGuild) {
        throw new Error(
          `Target server with ID ${this.targetGuildId} not found or bot doesn't have access.`,
        )
      }

      this.addLog(`Source server: ${sourceGuild.name} (${sourceGuild.id})`)
      this.addLog(`Target server: ${targetGuild.name} (${targetGuild.id})`)

      // Check if source and target are the same
      if (sourceGuild.id === targetGuild.id) {
        throw new Error('Source and target servers cannot be the same')
      }

      // Check bot permissions in target server
      const targetMember =
        targetGuild.members.me ||
        (await targetGuild.members.fetch(this.client.user.id).catch(() => null))
      if (!targetMember) {
        throw new Error('Bot is not a member of the target server')
      }

      if (
        !targetMember.permissions.has(Discord.PermissionFlagsBits.Administrator)
      ) {
        throw new Error('Bot needs administrator permissions in target server')
      }

      if (this.isCancelled) return
      this.updateProgress('Wiping target server', 25)
      await this.wipeTargetServer(targetGuild)

      if (this.isCancelled) return
      this.updateProgress('Backing up source server', 40)
      const structure = await this.backupSourceServer(sourceGuild)

      if (this.isCancelled) return
      this.updateProgress('Duplicating structure', 65)
      await this.duplicateToTarget(targetGuild, structure)

      if (this.isCancelled) return
      this.updateProgress('Finalizing', 95)
    } catch (error) {
      throw error
    }
  }

  async wipeTargetServer(guild) {
    this.addLog(`Starting to wipe target server: ${guild.name}`)

    // Fetch all channels and roles
    await guild.channels.fetch()
    await guild.roles.fetch()

    const channels = Array.from(guild.channels.cache.values())
    const roles = Array.from(guild.roles.cache.values())

    this.addLog(
      `Found ${channels.length} channels and ${roles.length} roles to process`,
    )

    // Delete non-category channels first
    const nonCategoryChannels = channels.filter(
      (ch) => ch.type !== Discord.ChannelType.GuildCategory,
    )
    this.totalItems = nonCategoryChannels.length
    this.processedItems = 0

    for (let i = 0; i < nonCategoryChannels.length; i++) {
      if (this.isCancelled) return
      const channel = nonCategoryChannels[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Deleting channel: ${channel.name}`,
      )
      try {
        this.addLog(`Deleting channel: ${channel.name}`)
        await channel.delete()
        await new Promise((resolve) => setTimeout(resolve, 800))
      } catch (error) {
        this.addLog(
          `Error deleting channel ${channel.name}: ${error.message}`,
          'warning',
        )
      }
    }

    // Delete categories
    const categories = channels.filter(
      (ch) => ch.type === Discord.ChannelType.GuildCategory,
    )
    this.totalItems = categories.length
    this.processedItems = 0

    for (let i = 0; i < categories.length; i++) {
      if (this.isCancelled) return
      const category = categories[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Deleting category: ${category.name}`,
      )
      try {
        this.addLog(`Deleting category: ${category.name}`)
        await category.delete()
        await new Promise((resolve) => setTimeout(resolve, 800))
      } catch (error) {
        this.addLog(
          `Error deleting category ${category.name}: ${error.message}`,
          'warning',
        )
      }
    }

    // Delete roles
    const deletableRoles = roles.filter(
      (role) => role.name !== '@everyone' && !role.managed && role.editable,
    )
    this.totalItems = deletableRoles.length
    this.processedItems = 0

    for (let i = 0; i < deletableRoles.length; i++) {
      if (this.isCancelled) return
      const role = deletableRoles[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Deleting role: ${role.name}`,
      )
      try {
        this.addLog(`Deleting role: ${role.name}`)
        await role.delete()
        await new Promise((resolve) => setTimeout(resolve, 800))
      } catch (error) {
        this.addLog(
          `Error deleting role ${role.name}: ${error.message}`,
          'warning',
        )
      }
    }

    this.addLog('Target server wipe complete')
  }

  async backupSourceServer(guild) {
    this.addLog(`Starting backup of source server: ${guild.name}`)

    await guild.channels.fetch()
    await guild.roles.fetch()

    const structure = {
      backup_info: {
        timestamp: new Date().toISOString(),
        source_server_id: guild.id,
        source_server_name: guild.name,
        bot_user: this.client.user.tag,
      },
      server_settings: {
        name: guild.name,
        description: guild.description,
      },
      categories: [],
      channels: [],
      roles: [],
    }

    // Backup categories
    const categories = Array.from(guild.channels.cache.values())
      .filter((ch) => ch.type === Discord.ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position)

    this.totalItems = categories.length
    this.processedItems = 0

    for (let i = 0; i < categories.length; i++) {
      if (this.isCancelled) return
      const category = categories[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Backing up category: ${category.name}`,
      )

      structure.categories.push({
        name: category.name,
        position: category.position,
      })
    }

    // Backup text channels
    const textChannels = Array.from(guild.channels.cache.values())
      .filter((ch) => ch.type === Discord.ChannelType.GuildText)
      .sort((a, b) => a.position - b.position)

    this.totalItems = textChannels.length
    this.processedItems = 0

    for (let i = 0; i < textChannels.length; i++) {
      if (this.isCancelled) return
      const channel = textChannels[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Backing up text channel: ${channel.name}`,
      )

      structure.channels.push({
        name: channel.name,
        type: 'text',
        position: channel.position,
        category: channel.parent ? channel.parent.name : null,
      })
    }

    // Backup voice channels
    const voiceChannels = Array.from(guild.channels.cache.values())
      .filter((ch) => ch.type === Discord.ChannelType.GuildVoice)
      .sort((a, b) => a.position - b.position)

    this.totalItems = voiceChannels.length
    this.processedItems = 0

    for (let i = 0; i < voiceChannels.length; i++) {
      if (this.isCancelled) return
      const channel = voiceChannels[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Backing up voice channel: ${channel.name}`,
      )

      structure.channels.push({
        name: channel.name,
        type: 'voice',
        position: channel.position,
        category: channel.parent ? channel.parent.name : null,
        bitrate: channel.bitrate,
        user_limit: channel.userLimit,
      })
    }

    // Backup roles
    const roles = Array.from(guild.roles.cache.values())
      .filter((role) => role.name !== '@everyone' && !role.managed)
      .sort((a, b) => b.position - a.position)

    this.totalItems = roles.length
    this.processedItems = 0

    for (let i = 0; i < roles.length; i++) {
      if (this.isCancelled) return
      const role = roles[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Backing up role: ${role.name}`,
      )

      structure.roles.push({
        name: role.name,
        color: role.hexColor,
        permissions: role.permissions.bitfield.toString(),
        position: role.position,
        hoist: role.hoist,
        mentionable: role.mentionable,
      })
    }

    this.addLog(
      `Backup complete: ${structure.categories.length} categories, ${structure.channels.length} channels, ${structure.roles.length} roles`,
    )

    return structure
  }

  async duplicateToTarget(guild, structure) {
    this.addLog(`Starting duplication to target server: ${guild.name}`)

    const roleMapping = {}
    const categoryMapping = {}

    // Create roles
    this.totalItems = structure.roles.length
    this.processedItems = 0

    for (let i = 0; i < structure.roles.length; i++) {
      if (this.isCancelled) return
      const roleData = structure.roles[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Creating role: ${roleData.name}`,
      )

      try {
        const color =
          roleData.color !== '#000000' && roleData.color !== '#000'
            ? roleData.color
            : null

        this.addLog(`Creating role: ${roleData.name}`)
        const newRole = await guild.roles.create({
          name: roleData.name,
          color: color,
          hoist: roleData.hoist,
          mentionable: roleData.mentionable,
          permissions: BigInt(roleData.permissions),
          reason: 'Duplicated from source server',
        })

        roleMapping[roleData.name] = newRole
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        this.addLog(
          `Failed to create role ${roleData.name}: ${error.message}`,
          'warning',
        )
      }
    }

    // Create categories
    this.totalItems = structure.categories.length
    this.processedItems = 0

    for (let i = 0; i < structure.categories.length; i++) {
      if (this.isCancelled) return
      const categoryData = structure.categories[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Creating category: ${categoryData.name}`,
      )

      try {
        this.addLog(`Creating category: ${categoryData.name}`)
        const newCategory = await guild.channels.create({
          name: categoryData.name,
          type: Discord.ChannelType.GuildCategory,
          position: categoryData.position,
          reason: 'Duplicated from source server',
        })

        categoryMapping[categoryData.name] = newCategory
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        this.addLog(
          `Failed to create category ${categoryData.name}: ${error.message}`,
          'warning',
        )
      }
    }

    // Create channels
    const sortedChannels = [...structure.channels].sort(
      (a, b) => a.position - b.position,
    )
    this.totalItems = sortedChannels.length
    this.processedItems = 0

    for (let i = 0; i < sortedChannels.length; i++) {
      if (this.isCancelled) return
      const channelData = sortedChannels[i]
      this.processedItems = i + 1
      this.updateDetailedProgress(
        this.processedItems,
        this.totalItems,
        `Creating ${channelData.type} channel: ${channelData.name}`,
      )

      try {
        const category =
          channelData.category && categoryMapping[channelData.category]
            ? categoryMapping[channelData.category]
            : null

        if (channelData.type === 'text') {
          this.addLog(`Creating text channel: ${channelData.name}`)
          await guild.channels.create({
            name: channelData.name,
            type: Discord.ChannelType.GuildText,
            parent: category,
            position: channelData.position,
            reason: 'Duplicated from source server',
          })
        } else if (channelData.type === 'voice') {
          this.addLog(`Creating voice channel: ${channelData.name}`)
          await guild.channels.create({
            name: channelData.name,
            type: Discord.ChannelType.GuildVoice,
            parent: category,
            position: channelData.position,
            bitrate: Math.min(
              channelData.bitrate || 64000,
              guild.maximumBitrate,
            ),
            userLimit: channelData.user_limit || 0,
            reason: 'Duplicated from source server',
          })
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        this.addLog(
          `Failed to create channel ${channelData.name}: ${error.message}`,
          'warning',
        )
      }
    }

    // Update server settings
    try {
      this.addLog('Updating server settings...')
      await guild.setName(structure.server_settings.name)

      if (structure.server_settings.description) {
        await guild.setDescription(structure.server_settings.description)
      }

      this.addLog('Server settings updated successfully')
    } catch (error) {
      this.addLog(
        `Could not update server settings: ${error.message}`,
        'warning',
      )
    }

    this.addLog('Duplication to target server complete')
  }
}

module.exports = { DiscordDuplicator }
