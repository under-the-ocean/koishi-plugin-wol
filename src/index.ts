import { Context, Schema } from 'koishi'
import { createSocket } from 'dgram'

export const name = 'wol'
export const inject = ['database']

export interface Device {
  id: number
  /** 设备所属用户 ID，用于用户隔离 */
  userId: string
  name: string
  mac: string
  broadcast?: string
  port?: number
  description?: string
}

export interface Config {
  defaultPort: number
  defaultBroadcast: string
  /** 是否启用用户隔离。开启后，每个用户只能看到和操作自己的设备。 */
  userIsolation: boolean
  /** 是否允许没有 userId 的旧设备作为全局设备被所有用户读取。 */
  allowLegacyGlobalDevices: boolean
}

export const Config: Schema<Config> = Schema.object({
  defaultPort: Schema.number().default(9).description('默认WOL端口'),
  defaultBroadcast: Schema.string().default('255.255.255.255').description('默认广播地址'),
  userIsolation: Schema.boolean().default(true).description('启用用户隔离：每个用户只能管理自己的设备'),
  allowLegacyGlobalDevices: Schema.boolean().default(false).description('兼容旧数据：允许读取未绑定用户的旧设备'),
})

declare module 'koishi' {
  interface Tables {
    wol_device: Device
  }
}

function createMagicPacket(mac: string): Buffer {
  const macParts = mac.replace(/[-:]/g, '').match(/.{2}/g)
  if (!macParts || macParts.length !== 6) {
    throw new Error('无效的MAC地址格式')
  }

  const macBytes = Buffer.from(macParts.map(hex => parseInt(hex, 16)))
  const prefix = Buffer.alloc(6, 0xFF)
  const repeatedMac = Buffer.alloc(16 * 6)

  for (let i = 0; i < 16; i++) {
    macBytes.copy(repeatedMac, i * 6)
  }

  return Buffer.concat([prefix, repeatedMac])
}

function sendWOL(mac: string, broadcast: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const packet = createMagicPacket(mac)
      const socket = createSocket('udp4')

      socket.on('error', (err) => {
        socket.close()
        reject(err)
      })

      socket.bind(() => {
        socket.setBroadcast(true)
        socket.send(packet, port, broadcast, (err) => {
          socket.close()
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    } catch (err) {
      reject(err)
    }
  })
}

function getUserId(session: any): string {
  return session?.userId || session?.uid || session?.author?.id || session?.event?.user?.id || 'unknown'
}

function getDeviceQuery(config: Config, session: any, name?: string) {
  const query: any = {}
  if (name) query.name = name
  if (config.userIsolation) {
    query.userId = getUserId(session)
  }
  return query
}

function getLegacyQuery(config: Config, name?: string) {
  if (!config.userIsolation || !config.allowLegacyGlobalDevices) return null
  const query: any = { userId: '' }
  if (name) query.name = name
  return query
}

async function getDevices(ctx: Context, config: Config, session: any, name?: string): Promise<Device[]> {
  const devices = await ctx.database.get('wol_device', getDeviceQuery(config, session, name))
  const legacyQuery = getLegacyQuery(config, name)
  if (!devices.length && legacyQuery) {
    return await ctx.database.get('wol_device', legacyQuery)
  }
  return devices
}

export async function apply(ctx: Context, config: Config) {
  ctx.model.extend('wol_device', {
    id: 'unsigned',
    userId: 'string',
    name: 'string',
    mac: 'string',
    broadcast: 'string',
    port: 'unsigned',
    description: 'string',
  }, {
    autoInc: true,
  })

  ctx.command('wol <name>', '唤醒指定设备')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定设备名称，使用 "wol.list" 查看可用设备'
      }

      const device = await getDevices(ctx, config, session, name)
      if (device.length === 0) {
        return `未找到设备 "${name}"，使用 "wol.list" 查看可用设备`
      }

      const d = device[0]
      const broadcast = d.broadcast || config.defaultBroadcast
      const port = d.port || config.defaultPort

      try {
        await sendWOL(d.mac, broadcast, port)
        return `✅ 已发送唤醒信号到 "${d.name}" (${d.mac})`
      } catch (err) {
        ctx.logger('wol').error('发送WOL信号失败:', err)
        return `❌ 发送唤醒信号失败: ${(err as Error).message}`
      }
    })

  ctx.command('wol.add <name> <mac>', '添加设备')
    .option('broadcast', '-b <address> 广播地址')
    .option('port', '-p <port:number> 端口号')
    .option('description', '-d <desc> 设备描述')
    .action(async ({ session, options }, name, mac) => {
      if (!name || !mac) {
        return '用法: wol.add <设备名> <MAC地址> [-b 广播地址] [-p 端口] [-d 描述]'
      }

      const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
      if (!macRegex.test(mac)) {
        return '❌ MAC地址格式错误，正确格式如: 00:11:22:33:44:55 或 00-11-22-33-44-55'
      }

      const existing = await ctx.database.get('wol_device', getDeviceQuery(config, session, name))
      if (existing.length > 0) {
        return `❌ 你的设备列表中已存在 "${name}"，请使用其他名称`
      }

      await ctx.database.create('wol_device', {
        userId: config.userIsolation ? getUserId(session) : '',
        name,
        mac: mac.toLowerCase(),
        broadcast: options.broadcast,
        port: options.port,
        description: options.description,
      })

      return `✅ 已添加设备 "${name}" (${mac})${config.userIsolation ? '，仅你可见' : ''}`
    })

  ctx.command('wol.remove <name>', '删除设备')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定要删除的设备名称'
      }

      const query = getDeviceQuery(config, session, name)
      const device = await ctx.database.get('wol_device', query)
      if (device.length === 0) {
        return `❌ 未找到设备 "${name}"`
      }

      await ctx.database.remove('wol_device', query)
      return `✅ 已删除设备 "${name}"`
    })

  ctx.command('wol.list', '列出设备')
    .action(async ({ session }) => {
      const devices = await getDevices(ctx, config, session)

      if (devices.length === 0) {
        return '暂无设备，使用 "wol.add" 添加设备'
      }

      const lines = devices.map(d => {
        const broadcast = d.broadcast || config.defaultBroadcast
        const port = d.port || config.defaultPort
        let line = `• ${d.name}: ${d.mac} (${broadcast}:${port})`
        if (d.description) {
          line += ` - ${d.description}`
        }
        return line
      })

      return (config.userIsolation ? '你的设备:\n' : '已配置的设备:\n') + lines.join('\n')
    })

  ctx.command('wol.mac <name>', '查看设备MAC地址')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定设备名称'
      }

      const device = await getDevices(ctx, config, session, name)
      if (device.length === 0) {
        return `❌ 未找到设备 "${name}"`
      }

      const d = device[0]
      return `设备 "${d.name}" 的MAC地址: ${d.mac}`
    })
}
