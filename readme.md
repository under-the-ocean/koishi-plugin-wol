# koishi-plugin-wolpc

[![npm](https://img.shields.io/npm/v/koishi-plugin-wolpc?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-wolpc)
[![license](https://img.shields.io/npm/l/koishi-plugin-wolpc?style=flat-square)](https://github.com/under-the-ocean/koishi-plugin-wol/blob/main/LICENSE)

Koishi 网络唤醒 (Wake-on-LAN) 插件，支持通过聊天命令远程唤醒局域网内的计算机。

## 功能特性

- 🚀 通过简单的聊天命令唤醒远程计算机
- 📱 支持多设备管理，可为不同设备配置不同参数
- ⚙️ 可自定义广播地址和端口
- 📝 支持为设备添加描述信息
- 🔒 基于 Koishi 数据库持久化存储设备信息

## 安装

### 通过 Koishi 插件市场安装（推荐）

在 Koishi 控制台的插件市场中搜索 `wolpc` 并安装。

### 通过 npm 安装

```bash
npm install koishi-plugin-wolpc
```

## 配置

在 Koishi 配置文件中进行如下配置：

```yaml
plugins:
  wolpc:
    defaultPort: 9                    # 默认WOL端口
    defaultBroadcast: 255.255.255.255 # 默认广播地址
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `defaultPort` | number | 9 | 默认WOL端口，常用端口为 7 或 9 |
| `defaultBroadcast` | string | 255.255.255.255 | 默认广播地址，局域网内通常为 255.255.255.255 或 192.168.x.255 |

## 使用方法

### 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `wol <设备名>` | 唤醒指定设备 | `wol nas` |
| `wol.add <名称> <MAC地址>` | 添加新设备 | `wol.add nas 00:11:22:33:44:55` |
| `wol.remove <设备名>` | 删除设备 | `wol.remove nas` |
| `wol.list` | 列出所有设备 | `wol.list` |
| `wol.mac <设备名>` | 查看设备MAC地址 | `wol.mac nas` |

### 添加设备

```
wol.add <设备名称> <MAC地址> [-b 广播地址] [-p 端口] [-d 描述]
```

**参数说明：**
- `<设备名称>`: 设备的唯一标识名称
- `<MAC地址>`: 设备的MAC地址，格式如 `00:11:22:33:44:55` 或 `00-11-22-33-44-55`
- `-b, --broadcast`: 可选，指定广播地址（覆盖全局配置）
- `-p, --port`: 可选，指定端口号（覆盖全局配置）
- `-d, --description`: 可选，添加设备描述

**示例：**

```
# 添加一个名为 nas 的设备
wol.add nas 00:11:22:33:44:55

# 添加设备并指定广播地址和描述
wol.add server 00-11-22-33-44-55 -b 192.168.1.255 -p 7 -d 我的服务器
```

### 唤醒设备

```
wol <设备名称>
```

**示例：**

```
wol nas
# 输出: ✅ 已发送唤醒信号到 "nas" (00:11:22:33:44:55)
```

### 查看设备列表

```
wol.list
```

**示例输出：**

```
已配置的设备:
• nas: 00:11:22:33:44:55 (255.255.255.255:9) - 我的NAS存储
• server: 00:11:22:33:44:66 (192.168.1.255:7) - 我的服务器
```

## 使用前提

### 1. 被唤醒设备要求

- **主板支持**：设备主板需要支持 Wake-on-LAN 功能
- **BIOS设置**：在BIOS中启用 "Wake on LAN"、"PCI-E Wake" 或类似选项
- **网卡支持**：网卡需要支持 WOL 功能
- **电源连接**：设备需要保持电源连接（关机但插电状态）

### 2. 操作系统设置

#### Windows

1. 打开设备管理器 → 网络适配器 → 右键网卡 → 属性
2. 在"电源管理"选项卡中勾选：
   - ✓ 允许计算机关闭此设备以节约电源
   - ✓ 允许此设备唤醒计算机
   - ✓ 只允许幻数据包唤醒计算机
3. 在"高级"选项卡中启用 "Wake on Magic Packet"

#### Linux

```bash
# 检查网卡是否支持WOL
ethtool <网卡名>

# 启用WOL
sudo ethtool -s <网卡名> wol g
```

### 3. 网络环境要求

- Koishi 服务器需要与被唤醒设备在同一局域网内
- 如果使用跨网段唤醒，需要配置子网定向广播或WOL代理
- 确保路由器/交换机允许UDP广播包通过

## 常见问题

### Q: 为什么发送了唤醒信号但设备没有唤醒？

A: 请检查以下几点：
1. 设备主板BIOS中是否启用了WOL功能
2. 网卡驱动设置中是否允许WOL唤醒
3. 设备是否处于完全关机状态（部分设备需要从S5状态唤醒）
4. Koishi服务器与目标设备是否在同一网络
5. MAC地址是否正确

### Q: 如何查看设备的MAC地址？

A: 
- **Windows**: 命令提示符运行 `ipconfig /all`，查看"物理地址"
- **Linux**: 终端运行 `ip link` 或 `ifconfig`，查看 `link/ether`
- **路由器管理页面**: 通常在DHCP客户端列表或ARP表中可以查看

### Q: 支持跨网段唤醒吗？

A: 插件本身支持指定广播地址，但跨网段唤醒需要：
1. 路由器支持并配置了子网定向广播
2. 或者使用WOL代理/中继设备
3. 或者在目标网段部署Koishi实例

### Q: 默认端口7和9有什么区别？

A: 两个端口都是常用的WOL端口：
- 端口7 (Echo Protocol)
- 端口9 (Discard Protocol)

大多数设备都能响应这两个端口，如果其中一个不工作，可以尝试另一个。

## 技术实现

本插件使用 Node.js 原生的 `dgram` 模块实现UDP广播，构造标准的WOL魔术包（Magic Packet）：

```
FF FF FF FF FF FF        <- 6字节前缀
MAC MAC MAC MAC MAC MAC    <- 重复16次的MAC地址
```

## 依赖

- [koishi](https://koishi.chat/) ^4.17.0 - Koishi 机器人框架

## 开源协议

[MIT](LICENSE)

## 作者

- [ocean之下](https://space.bilibili.com/3546571704634103)

## 相关链接

- [Koishi 官方文档](https://koishi.chat/)
- [Wake-on-LAN 协议规范](https://en.wikipedia.org/wiki/Wake-on-LAN)
- [GitHub 仓库](https://github.com/under-the-ocean/koishi-plugin-wol)
