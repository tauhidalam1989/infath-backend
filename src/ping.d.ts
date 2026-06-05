declare module 'ping' {
  export interface PingResponse {
    host: string;
    alive: boolean;
    output: string;
    time: number;
    min: number;
    max: number;
    avg: number;
    stddev: number;
  }

  export interface PingOptions {
    timeout?: number;
    min_reply?: number;
    deadline?: number;
    extra?: string[];
  }

  export const promise: {
    probe(host: string, options?: PingOptions): Promise<PingResponse>;
  };

  export function probe(
    host: string,
    callback: (result: PingResponse) => void
  ): void;
  export function probe(
    host: string,
    options: PingOptions,
    callback: (result: PingResponse) => void
  ): void;
}

