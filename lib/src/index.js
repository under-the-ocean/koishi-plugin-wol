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
async function apply(ctx, config) {
    ctx.model.extend('wol_device', {
        id: 'unsigned',
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
        const device = await ctx.database.get('wol_device', { name });
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
        .option('port', '-p <port> 端口号')
        .option('description', '-d <desc> 设备描述')
        .action(async ({ options }, name, mac) => {
        if (!name || !mac) {
            return '用法: wol.add <设备名> <MAC地址> [-b 广播地址] [-p 端口] [-d 描述]';
        }
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        if (!macRegex.test(mac)) {
            return '❌ MAC地址格式错误，正确格式如: 00:11:22:33:44:55 或 00-11-22-33-44-55';
        }
        const existing = await ctx.database.get('wol_device', { name });
        if (existing.length > 0) {
            return `❌ 设备 "${name}" 已存在，请使用其他名称`;
        }
        await ctx.database.create('wol_device', {
            name,
            mac: mac.toLowerCase(),
            broadcast: options.broadcast,
            port: options.port,
            description: options.description,
        });
        return `✅ 已添加设备 "${name}" (${mac})`;
    });
    ctx.command('wol.remove <name>', '删除设备')
        .action(async (_, name) => {
        if (!name) {
            return '请指定要删除的设备名称';
        }
        const device = await ctx.database.get('wol_device', { name });
        if (device.length === 0) {
            return `❌ 未找到设备 "${name}"`;
        }
        await ctx.database.remove('wol_device', { name });
        return `✅ 已删除设备 "${name}"`;
    });
    ctx.command('wol.list', '列出所有设备')
        .action(async () => {
        const devices = await ctx.database.get('wol_device', {});
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
        return '已配置的设备:\n' + lines.join('\n');
    });
    ctx.command('wol.mac <name>', '查看设备MAC地址')
        .action(async (_, name) => {
        if (!name) {
            return '请指定设备名称';
        }
        const device = await ctx.database.get('wol_device', { name });
        if (device.length === 0) {
            return `❌ 未找到设备 "${name}"`;
        }
        const d = device[0];
        return `设备 "${d.name}" 的MAC地址: ${d.mac}`;
    });
}
