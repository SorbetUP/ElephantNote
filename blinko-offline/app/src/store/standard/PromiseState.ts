import { makeAutoObservable } from "mobx";
import { RootStore } from "../root";
import { BaseState, BooleanState, NumberState } from "./base";
import { ToastPlugin } from "../module/Toast/Toast";
import { eventBus } from "@/lib/event";
import { BlinkoStore } from "../blinkoStore";
import i18n from "@/lib/i18n";
import { StorageState } from "./StorageState";
import { BaseStore } from "../baseStore";
import { getBlinkoEndpoint, isTauriAndEndpointUndefined } from "@/lib/blinkoEndpoint";

export interface Events {
  data: (data: any) => void;
  error: (error: any) => void;
  select: (index: number) => void;
  update: () => void;
  finally: () => void;
  wait: () => void;
}

export const PromiseCall = async (f: Promise<any>, { autoAlert = true }: { autoAlert?: boolean, successMsg?: string } = {}) => {
  try {
    const r = await (new PromiseState({
      autoAlert,
      successMsg: i18n.t('operation-success'),
      function: async () => {
        return await f;
      }
    })).call()
    RootStore.Get(BlinkoStore).updateTicker++
    return r
  } catch (error) {
    RootStore.Get(ToastPlugin).error(error.message);
  }
}

export class PromiseState<T extends (...args: any[]) => Promise<any>, U = ReturnType<T>> {
  sid = "PromiseState";
  key?: string;
  loading = new BooleanState();
  //@ts-ignore
  value?: Awaited<U> = null;
  defaultValue: any = null;
  function!: T;
  autoAlert = true;
  autoUpdate = false;
  context: any = undefined;
  autoInit = false;
  autoClean = false;
  autoAuthRedirect = true;
  successMsg: string = "";
  errMsg: string = "";
  loadingLock = true;
  eventKey?: string;
  currentIndex: BaseState = new NumberState({ value: 0 });
  get current() {
    if (Array.isArray(this.value) && this.value.length > 0 && !this.value[this.currentIndex.value]) {
      this.currentIndex.setValue(0);
    }
    //@ts-ignore
    return this.value[this.currentIndex.value];
  }

  async wait({ call = false } = {}): Promise<Awaited<U>> {
    return new Promise<Awaited<U>>((res, rej) => {
      if (this.value) {
        if (Array.isArray(this.value)) {
          if (this.value.length > 0) {
            res(this.value);
          }
        } else {
          res(this.value);
        }
      }

      //@ts-ignore
      if (call && !this.loading.value) this.call();
    });
  }

  constructor(args: Partial<PromiseState<T, U>> = {}) {
    Object.assign(this, args);
    if (this.defaultValue) {
      this.value = this.defaultValue;
    }
    if (this.key) {
      RootStore.init().add(this, { sid: this.key });
    } else {
      // Keep internal caches non-observable to avoid overhead.
      makeAutoObservable(this, { _seenIds: false });
    }
  }

  async setValue(val) {
    let _val = val;
    this.value = _val;
  }

  async getOrCall(...args: Parameters<T>): Promise<Awaited<U> | undefined> {
    if (this.value) {
      if (Array.isArray(this.value)) {
        if (this.value.length > 0) {
          return this.value;
        } else {
          return this.call(...args);
        }
      } else {
        return this.value;
      }
    } else {
      return this.call(...args);
    }
  }

  async call(...args: Parameters<T>): Promise<Awaited<U> | undefined> {
    const toast = RootStore.Get(ToastPlugin);
    const base = RootStore.Get(BaseStore);
    try {
      if (this.loadingLock && this.loading.value == true) return;
      this.loading.setValue(true);
      const res = await this.function.apply(this.context, args);
      this.setValue(res);
      if (this.autoAlert && this.successMsg && res) {
        toast.success(this.successMsg);
      }
      return res;
    } catch (error) {
      if (this.autoAlert && base.isOnline) {
        const message = error.message;
        if (message.includes("Unauthorized")) {
          toast.dismiss();
          if (this.autoAuthRedirect) {
            eventBus.emit('user:signout')
          }
        } else {
          this.errMsg = message;
          if (isTauriAndEndpointUndefined()) {
            return
          }
          toast.error(message);
        }
      } else {
        throw error;
      }
    } finally {
      this.loading.setValue(false);
      if (this.eventKey) {
        eventBus.emit(this.eventKey, this.value);
      }
    }
  }
}


export const PageSize = new StorageState<number>({ key: "pageSize", value: 30, default: 30 })
export class PromisePageState<T extends (...args: any) => Promise<any>, U = ReturnType<T>> {
  page: number = 1;
  size = PageSize
  sid = "PromisePageState";
  key?: string;
  loading = new BooleanState();
  isLoadAll: boolean = false;
  autoAuthRedirect: boolean = true;
  // Optional stable ID extractor to enable O(pageSize) dedup when appending pages.
  // If omitted, we fall back to `item.id` when available, otherwise no dedup.
  getId?: (item: any) => string | number;
  private _seenIds: Set<string | number> | null = null;
  get isEmpty() {
    if (this.loading.value) return false
    if (this.value == null) return true
    //@ts-ignore
    return this.value?.length == 0
  }
  get isLoading() {
    return this.loading.value
  }
  //@ts-ignore
  value?: Awaited<U> = [];
  defaultValue: any = [];
  function!: T;

  autoAlert = true;
  autoUpdate = false;
  autoInit = false;
  autoClean = false;
  context: any = undefined;

  successMsg: string = "";
  errMsg: string = "";

  loadingLock = true;

  toJSON() {
    return {
      value: this.value,
    };
  }

  constructor(args: Partial<PromisePageState<T, U>> = {}) {
    Object.assign(this, args);
    if (this.defaultValue) {
      this.value = this.defaultValue;
    }
    if (this.key) {
      RootStore.init().add(this, { sid: this.key });
    } else {
      makeAutoObservable(this);
    }
  }

  async setValue(val) {
    let _val = val;
    this.value = _val;
  }

  private _extractId(item: any): string | number | null {
    if (this.getId) {
      try {
        const id = this.getId(item);
        return typeof id === 'string' || typeof id === 'number' ? id : null;
      } catch {
        return null;
      }
    }
    if (item && typeof item === 'object' && 'id' in item) {
      const id = (item as any).id;
      return typeof id === 'string' || typeof id === 'number' ? id : null;
    }
    return null;
  }

  private _resetSeenIdsFrom(items: any[] | null) {
    if (!items || items.length === 0) {
      this._seenIds = null;
      return;
    }
    const firstId = this._extractId(items[0]);
    if (firstId == null) {
      this._seenIds = null;
      return;
    }
    const s = new Set<string | number>();
    for (const it of items) {
      const id = this._extractId(it);
      if (id != null) s.add(id);
    }
    this._seenIds = s;
  }

  private _appendDedup(existing: any[] | null, incoming: any[]): any[] {
    const base = Array.isArray(existing) ? existing : [];
    if (!this._seenIds) this._resetSeenIdsFrom(base);

    if (!this._seenIds) {
      // No stable IDs available; best-effort append.
      return base.concat(incoming);
    }

    const out = base.slice();
    for (const item of incoming) {
      const id = this._extractId(item);
      if (id == null) {
        out.push(item);
        continue;
      }
      if (this._seenIds.has(id)) continue;
      this._seenIds.add(id);
      out.push(item);
    }
    return out;
  }

  private async call(...args: Parameters<T>): Promise<Awaited<U> | undefined> {
    const toast = RootStore.Get(ToastPlugin);
    const base = RootStore.Get(BaseStore);

    try {
      if (this.loadingLock && this.loading.value == true) {
        console.warn('loadingLock', this.loading.value);
        return
      };
      this.loading.setValue(true);
      if (args?.[0]) {
        Object.assign(args?.[0], { page: this.page, size: Number(this.size.value) })
      } else {
        args[0] = { page: this.page, size: Number(this.size.value) }
      }
      if (this.isLoadAll) return this.value
      const res = await this.function.apply(this.context, args);
      if (!Array.isArray(res)) throw new Error("PromisePageState function must return array")
      if (res.length == 0) {
        this.isLoadAll = true
        if (this.page == 1) {
          this.setValue(null);
          this._seenIds = null;
        }
        //@ts-ignore
        return this.value
      }
      // Do not infer "load all" from `res.length < size`. Some backends may return a short page
      // due to filtering/dedup while still having more items on subsequent pages.
      if (this.page == 1) {
        this.setValue(res);
        this._resetSeenIdsFrom(res);
      } else {
        //@ts-ignore
        this.setValue(this._appendDedup(this.value, res));
      }

      if (this.autoAlert && this.successMsg && res) {
        toast.success(this.successMsg);
      }
      return this.value;
    } catch (error) {
      if (this.autoAlert && base.isOnline) {
        const message = error.message;
        if (message.includes("Unauthorized")) {
          toast.dismiss();
          if (this.autoAuthRedirect) {
            eventBus.emit('user:signout')
          }
        } else {
          this.errMsg = message;
          if (isTauriAndEndpointUndefined()) {
            return
          }
          toast.error(message);
        }
      } else {
        throw error;
      }
    } finally {
      this.loading.setValue(false);
    }
  }

  async resetAndCall(...args: Parameters<T>): Promise<Awaited<U> | undefined> {
    this.isLoadAll = false
    this.page = 1
    this._seenIds = null
    //@ts-ignore
    return await this.call(...args)
  }
  async callNextPage(...args: Parameters<T>): Promise<Awaited<U> | undefined> {
    if (this.loading.value) return
    this.page++
    //@ts-ignore
    return await this.call(...args)
  }
}
