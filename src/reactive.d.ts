declare module Carbon {
  export class Reactive {
    trigger(e: any): void;
    
    on(name: string, callback: Function) : Listener;
    off(name: string): void;
  }

  export class Listener {
    pause(): void;
    resume(): void;
    dispose(): void;
  }
}