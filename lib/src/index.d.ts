import { Context, Schema } from 'koishi';
export declare const name = "wol";
export declare const inject: string[];
export interface Device {
    id: number;
    name: string;
    mac: string;
    broadcast?: string;
    port?: number;
    description?: string;
}
export interface Config {
    defaultPort: number;
    defaultBroadcast: string;
}
export declare const Config: Schema<Config>;
declare module 'koishi' {
    interface Tables {
        wol_device: Device;
    }
}
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map