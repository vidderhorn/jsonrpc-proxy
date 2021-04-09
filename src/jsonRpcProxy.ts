import { nanoid } from "nanoid";
import ky from "ky-universal";

const TIME_LIMIT = 5000;

export module JsonRpcProxy {
  /** Create a proxy using HTTP post. */
  export function post<Service>(url: string, options: Options = {}, headers: Headers = {}) {
    return JsonRpcProxy.client<Service>(Transport.post(url, headers), options);
  }

  /** Create a transport-agnostic proxy. */
  export function client<Service>(transport: Transport, options: Options = {}) {
    return new Proxy({}, {
      get(obj, prop) {
        return (arg: any) => {
          return JsonRpcProxy.request(transport, prop.toString(), arg, options);
        };
      }
    }) as Service;
  }

  /** Issue a request. */
  export function request<Params, Value>(transport: Transport, method: string, params: Params, options: Options = {}): Promise<Value> {
    const id = nanoid();
    const timeLimit = options.timeLimit || TIME_LIMIT;
    return new Promise((resolve, reject) => {
      let cancelled = false;
      const timer = setTimeout(timedOut, timeLimit);
      function timedOut() {
        cancelled = true;
        reject(new Error());
      }
      if (options.formatParams) {
        params = options.formatParams(params);
      }
      transport<Params, Value>({ jsonrpc: "2.0", id, method, params })
        .then((response) => {
          clearTimeout(timer);
          if (cancelled) {
            return;
          }
          if ("error" in response) {
            reject(new Error(response.error.message));
            return;
          }
          const value = options.formatValue
            ? options.formatValue(response.result)
            : response.result;
          resolve(value);
        })
        .catch((reason: any) => reject(reason));
    });
  }

  export type Headers = { [key: string]: string };
  export type Transport = <Params, Value>(request: Request<Params>) => Promise<Response<Value>>;
  
  export interface Options {
    timeLimit?: number;
    formatParams?: (params: any) => any;
    formatValue?: (value: any) => any;
  }

  export module Transport {
    /** Uses HTTP POST to send requests. */
    export function post(url: string, headers: Headers = {}): Transport {
      return async function send<Params, Value>(request: Request<Params>) {
        return ky.post(url, { json: request, headers }).json();
      };
    }
  }

  export interface Request<Params> {
    jsonrpc: "2.0";
    method: string;
    params: Params;
    id?: string | number;
  }

  export type Response<Value> = Success<Value> | Failure;

  export interface Success<Value> {
    jsonrpc: "2.0";
    result: Value;
    id: string | number;
  }

  export interface Failure {
    jsonrpc: "2.0";
    error: Error;
    id: string | number;
  }

  export interface Error {
    code: number;
    message: string;
    data: any;
  }
}

export default JsonRpcProxy;

declare function setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): number;
declare function clearTimeout(timeoutId: number): void;
declare module console { export function log(...xs: any[]): void }