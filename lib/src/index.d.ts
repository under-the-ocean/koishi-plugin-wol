import { Context, Schema } from 'koishi';
export declare const name = "wol";
export declare const inject: string[];
export interface Device {
    id: number;
    /** 设备所属用户 ID，用于用户隔离 */
    userId: string;
    name: string;
    mac: string;
    broadcast?: string;
    port?: number;
    description?: string;
}
export interface Config {
    defaultPort: number;
    defaultBroadcast: string;
    /** 是否启用用户隔离。开启后，每个用户只能看到和操作自己的设备。 */
    userIsolation: boolean;
    /** 是否允许没有 userId 的旧设备作为全局设备被所有用户读取。 */
    allowLegacyGlobalDevices: boolean;
}
export declare const Config: Schema<Config>;
declare module 'koishi' {
    interface Tables {
        wol_device: Device;
    }
}
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map
