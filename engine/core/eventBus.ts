
type Handler<T> = (payload: T) => void;

export class TypedEventBus<Events extends Record<string, any>> {
  private map = new Map<string, Set<Handler<any>>>();

  on<K extends keyof Events>(event: K, cb: Handler<Events[K]>): void;
  on(event: string, cb: Handler<any>): void;
  on(event: string, cb: Handler<any>) {
    const set = this.map.get(event) ?? new Set();
    set.add(cb);
    this.map.set(event, set);
  }

  off<K extends keyof Events>(event: K, cb: Handler<Events[K]>): void;
  off(event: string, cb: Handler<any>): void;
  off(event: string, cb: Handler<any>) {
    this.map.get(event)?.delete(cb);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
  emit(event: string, payload: any): void;
  emit(event: string, payload: any) {
    this.map.get(event)?.forEach(cb => cb(payload));
  }
}
