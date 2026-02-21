export type RouteHandler = (context: RouterContext) => void | Promise<void>;
export type BeforeHook = (context: RouterContext) => boolean | void;
export type LinkClickHandler = (event: { target: HTMLElement }) => boolean | void;
export type RouteConfig = RouteHandler | { load: RouteHandler; unload: RouteHandler };
export type RouteActionType = 'load' | 'unload';

export interface NavigateOptions {
  replace?: boolean;
}

export interface RouteState {
  url: string;
  [key: string]: unknown;
}

export class Router {
  static instance: Router;

  routes: Route[] = [];
  callbacks: RouteAction[] = [];
  context: RouterContext | null = null;
  popObserver!: EventHandler;
  clickObserver!: EventHandler;
  beforeLoad?: BeforeHook;
  beforeNavigate?: BeforeHook;
  executing = false;
  onLinkClick?: LinkClickHandler;

  constructor(routes: Record<string, RouteConfig>) {
    if (routes && typeof routes === 'object') {
      for (const key of Object.keys(routes)) {
        this.route(key, routes[key]);
      }
    }

    Router.instance = this;
  }

  start() {
    this.popObserver = new EventHandler(window, 'popstate', this.#onPopState.bind(this), false);
    this.clickObserver = new EventHandler(window, 'click', this.#onClick.bind(this) as EventListener, true);

    const cxt = new RouterContext(
      location.pathname + location.search,
      null
    );

    cxt.hash = location.hash;
    cxt.init = true;

    cxt.save();

    this.#dispatch(cxt);
  }

  on(type: string, listener: EventListener) {
    document.addEventListener(type, listener, false);
  }

  stop() {
    this.popObserver.stop();
    this.clickObserver.stop();
  }

  route(path: string, handler: RouteConfig) {
    this.routes.push(new Route(path, handler));
  }

  navigate(url: string, options?: NavigateOptions) {
    const cxt = new RouterContext(url, null);

    if (options?.replace) cxt.replace = true;

    this.#navigate(cxt);
  }

  #navigate(cxt: RouterContext) {
    let result = trigger(document, 'router:navigate', cxt);

    if (result === false) return;

    if (this.beforeNavigate) {
      const hookResult = this.beforeNavigate(cxt);

      if (hookResult === false) {
        return;
      }
    }

    if (this.context && this.context.url === cxt.url) {
      return;
    }

    if (cxt.replace) {
      cxt.save();
    }
    else {
      history.pushState(cxt.state, cxt.title ?? '', cxt.url);
    }

    this.#dispatch(cxt);
  }

  #dispatch(cxt: RouterContext) {
    const context = this.context;

    if (context?.route?.unload) {
      context.nextpath = cxt.path;

      this.#execute(new RouteAction('unload', context.route.unload, context));
    }

    if (!cxt.route) {
      cxt.route = this.#getRoute(cxt);
    }

    if (!cxt.route) return;

    cxt.params = cxt.route.params(cxt.path);

    if (context) {
      cxt.prevpath = context.path;
    }

    if (this.beforeLoad) {
      this.beforeLoad(cxt);
    }

    this.#execute(new RouteAction('load', cxt.route.load, cxt));

    this.context = cxt;
  }

  #getRoute(cxt: RouterContext): Route | null {
    return this.routes.find(route => route.test(cxt.path)) ?? null;
  }

  #execute(action: RouteAction) {
    this.callbacks.push(action);

    if (!this.executing) {
      this.#fireNext();
    }
  }

  #fireNext() {
    if (this.callbacks.length === 0) {
      this.executing = false;

      return;
    }

    this.executing = true;

    const action = this.callbacks.shift()!;

    const result = action.handler(action.context);

    if (result && result.then) {
      result.then(() => {
        trigger(document, 'route:' + action.type, action.context);

        this.#fireNext();
      });
    }
    else {
      this.#fireNext();

      trigger(document, 'route:' + action.type, action.context);
    }
  }

  #onPopState(e: PopStateEvent) {
    if (!e.state || !e.state.url) return;

    this.#dispatch(new RouterContext(e.state.url, e.state));
  }

  #onClick(e: MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;

    let el = e.target as HTMLElement;

    while (el && el.nodeName !== 'A') {
      el = el.parentNode as HTMLElement;
    }

    if (!el || el.nodeName !== 'A') return;

    const href = el.getAttribute('href');

    if (!href) return;

    if (this.onLinkClick && this.onLinkClick({ target: el }) === false) {
      return;
    }

    if (href.includes('://') || href.includes('mailto:')) {
      return;
    }

    const cxt = new RouterContext(href, null);

    cxt.route = this.#getRoute(cxt);

    if (!cxt.route) return;

    cxt.clickEvent = e;
    cxt.target = el;

    e.preventDefault();

    this.#navigate(cxt);
  }
}

export class RouterContext {
  url: string;
  hash = '';
  prevpath = '';
  nextpath = '';
  state: RouteState;
  title: string | null = null;
  params: Record<string, string> | null = null;
  route: Route | null = null;
  clickEvent!: MouseEvent;
  target!: HTMLElement;
  init = false;
  replace = false;

  constructor(url: string, state: RouteState | null) {
    this.url = url;

    this.state = state ?? { url };

    this.state.url = url;
  }

  get path(): string {
    const queryIndex = this.url.indexOf('?');

    return (queryIndex > 0)
      ? this.url.substring(0, queryIndex)
      : this.url;
  }

  save() {
    history.replaceState(this.state, this.title ?? '', this.url + this.hash);
  }
}

export class Route {
  url: string;
  paramNames: string[] = [];

  regexp: RegExp;

  load: RouteHandler;
  unload?: RouteHandler;

  constructor(url: string, fn: RouteConfig) {
    this.url = url;

    if (typeof fn === 'function') {
      this.load = fn;
    }
    else {
      this.load = fn.load.bind(fn);
      this.unload = fn.unload.bind(fn);
    }

    const re = /{([^}]+)}/g;

    let re2 = url;
    let item: RegExpExecArray | null;

    while ((item = re.exec(url))) {
      this.paramNames.push(item[1]);

      re2 = re2.replace(item[0], '\\s*(.*)\\s*');
    }

    this.regexp = new RegExp(re2 + '$', 'i');
  }

  params(path: string): Record<string, string> | null {
    const match = this.regexp.exec(path);

    if (!match) return null;

    const params: Record<string, string> = {};

    for (let i = 1; i < match.length; i++) {
      params[this.paramNames[i - 1]] = match[i];
    }

    return params;
  }

  test(path: string): boolean {
    return this.regexp.test(path);
  }
}

function trigger(element: Element | Document, name: string, detail?: unknown): boolean {
  return element.dispatchEvent(new CustomEvent(name, {
    bubbles: true,
    detail: detail
  }));
}

class EventHandler {
  constructor(
    public element: HTMLElement | Window,
    public type: string,
    public handler: EventListener,
    public useCapture = false
  ) {
    this.element.addEventListener(type, handler, useCapture);
  }

  stop() {
    this.element.removeEventListener(this.type, this.handler, this.useCapture);
  }
}

export class RouteAction {
  constructor(
    public type: RouteActionType,
    public handler: RouteHandler,
    public context: RouterContext
  ) { }
}