"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const dgram_1 = require("dgram");
exports.name = 'wol';
exports.inject = ['database'];
exports.Config = koishi_1.Schema.object({
    defaultPort: koishi_1.Schema.number().default(9).description('默认WOL端口'),
    defaultBroadcast: koishi_1.Schema.string().default('255.255.255.255').description('默认广播地址'),
    userIsolation: koishi_1.Schema.boolean().default(true).description('启用用户隔离：每个用户只能管理自己的设备'),
    allowLegacyGlobalDevices: koishi_1.Schema.boolean().default(false).description('兼容旧数据：允许读取未绑定用户的旧设备'),
});
function createMagicPacket(mac) {
    const macParts = mac.replace(/[-:]/g, '').match(/.{2}/g);
    if (!macParts || macParts.length !== 6) {
        throw new Error('无效的MAC地址格式');
    }
    const macBytes = Buffer.from(macParts.map(hex => parseInt(hex, 16)));
    const prefix = Buffer.alloc(6, 0xFF);
    const repeatedMac = Buffer.alloc(16 * 6);
    for (let i = 0; i < 16; i++) {
        macBytes.copy(repeatedMac, i * 6);
    }
    return Buffer.concat([prefix, repeatedMac]);
}
function sendWOL(mac, broadcast, port) {
    return new Promise((resolve, reject) => {
        try {
            const packet = createMagicPacket(mac);
            const socket = (0, dgram_1.createSocket)('udp4');
            socket.on('error', (err) => {
                socket.close();
                reject(err);
            });
            socket.bind(() => {
                socket.setBroadcast(true);
                socket.send(packet, port, broadcast, (err) => {
                    socket.close();
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        }
        catch (err) {
            reject(err);
        }
    });
}
function getUserId(session) {
    return session?.userId || session?.uid || session?.author?.id || session?.event?.user?.id || 'unknown';
}
function getDeviceQuery(config, session, name) {
    const query = {};
    if (name)
        query.name = name;
    if (config.userIsolation) {
        query.userId = getUserId(session);
    }
    return query;
}
function getLegacyQuery(config, name) {
    if (!config.userIsolation || !config.allowLegacyGlobalDevices)
        return null;
    const query = { userId: '' };
    if (name)
        query.name = name;
    return query;
}
async function getDevices(ctx, config, session, name) {
    const devices = await ctx.database.get('wol_device', getDeviceQuery(config, session, name));
    const legacyQuery = getLegacyQuery(config, name);
    if (!devices.length && legacyQuery) {
        return await ctx.database.get('wol_device', legacyQuery);
    }
    return devices;
}
async function apply(ctx, config) {
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
    });
    ctx.command('wol <name>', '唤醒指定设备')
        .action(async ({ session }, name) => {
        if (!name) {
            return '请指定设备名称，使用 "wol.list" 查看可用设备';
        }
        const device = await getDevices(ctx, config, session, name);
        if (device.length === 0) {
            return `未找到设备 "${name}"，使用 "wol.list" 查看可用设备`;
        }
        const d = device[0];
        const broadcast = d.broadcast || config.defaultBroadcast;
        const port = d.port || config.defaultPort;
        try {
            await sendWOL(d.mac, broadcast, port);
            return `✅ 已发送唤醒信号到 "${d.name}" (${d.mac})`;
        }
        catch (err) {
            ctx.logger('wol').error('发送WOL信号失败:', err);
            return `❌ 发送唤醒信号失败: ${err.message}`;
        }
    });
    ctx.command('wol.add <name> <mac>', '添加设备')
        .option('broadcast', '-b <address> 广播地址')
        .option('port', '-p <port:number> 端口号')
        .option('description', '-d <desc> 设备描述')
        .action(async ({ session, options }, name, mac) => {
        if (!name || !mac) {
            return '用法: wol.add <设备名> <MAC地址> [-b 广播地址] [-p 端口] [-d 描述]';
        }
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        if (!macRegex.test(mac)) {
            return '❌ MAC地址格式错误，正确格式如: 00:11:22:33:44:55 或 00-11-22-33-44-55';
        }
        const existing = await ctx.database.get('wol_device', getDeviceQuery(config, session, name));
        if (existing.length > 0) {
            return `❌ 你的设备列表中已存在 "${name}"，请使用其他名称`;
        }
        await ctx.database.create('wol_device', {
            userId: config.userIsolation ? getUserId(session) : '',
            name,
            mac: mac.toLowerCase(),
            broadcast: options.broadcast,
            port: options.port,
            description: options.description,
        });
        return `✅ 已添加设备 "${name}" (${mac})${config.userIsolation ? '，仅你可见' : ''}`;
    });
    ctx.command('wol.remove <name>', '删除设备')
        .action(async ({ session }, name) => {
        if (!name) {
            return '请指定要删除的设备名称';
        }
        const query = getDeviceQuery(config, session, name);
        const device = await ctx.database.get('wol_device', query);
        if (device.length === 0) {
            return `❌ 未找到设备 "${name}"`;
        }
        await ctx.database.remove('wol_device', query);
        return `✅ 已删除设备 "${name}"`;
    });
    ctx.command('wol.list', '列出设备')
        .action(async ({ session }) => {
        const devices = await getDevices(ctx, config, session);
        if (devices.length === 0) {
            return '暂无设备，使用 "wol.add" 添加设备';
        }
        const lines = devices.map(d => {
            const broadcast = d.broadcast || config.defaultBroadcast;
            const port = d.port || config.defaultPort;
            let line = `• ${d.name}: ${d.mac} (${broadcast}:${port})`;
            if (d.description) {
                line += ` - ${d.description}`;
            }
            return line;
        });
        return (config.userIsolation ? '你的设备:\n' : '已配置的设备:\n') + lines.join('\n');
    });
    ctx.command('wol.mac <name>', '查看设备MAC地址')
        .action(async ({ session }, name) => {
        if (!name) {
            return '请指定设备名称';
        }
        const device = await getDevices(ctx, config, session, name);
        if (device.length === 0) {
            return `❌ 未找到设备 "${name}"`;
        }
        const d = device[0];
        return `设备 "${d.name}" 的MAC地址: ${d.mac}`;
    });
}
