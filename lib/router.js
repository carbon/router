export class Router {
    static instance;
    routes = [];
    callbacks = [];
    context = null;
    popObserver;
    clickObserver;
    beforeLoad;
    beforeNavigate;
    executing = false;
    onLinkClick;
    constructor(routes) {
        if (routes && typeof routes == 'object') {
            for (var key of Object.keys(routes)) {
                this.route(key, routes[key]);
            }
        }
        Router.instance = this;
    }
    start() {
        this.popObserver = new EventHandler(window, 'popstate', this.onPopState.bind(this), false);
        this.clickObserver = new EventHandler(window, 'click', this.onClick.bind(this), true);
        let cxt = new RouterContext(location.pathname + location.search, null);
        cxt.hash = location.hash;
        cxt.init = true;
        cxt.save();
        this.#dispatch(cxt);
    }
    on(type, listener) {
        document.addEventListener(type, listener, false);
    }
    stop() {
        this.popObserver.stop();
        this.clickObserver.stop();
    }
    route(path, handler) {
        this.routes.push(new Route(path, handler));
    }
    navigate(url, options) {
        let cxt = new RouterContext(url, null);
        if (options && options.replace)
            cxt.replace = true;
        this.#navigate(cxt);
    }
    #navigate(cxt) {
        let result = trigger(document, 'router:navigate', cxt);
        if (result === false)
            return;
        if (this.beforeNavigate) {
            let result = this.beforeNavigate(cxt);
            if (result === false) {
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
            history.pushState(cxt.state, cxt.title, cxt.url);
        }
        this.#dispatch(cxt);
    }
    #dispatch(cxt) {
        let context = this.context;
        if (context && context.route.unload) {
            context.nextpath = cxt.path;
            this.#execute(new RouteAction('unload', context.route.unload, context));
        }
        if (!cxt.route) {
            cxt.route = this.#getRoute(cxt);
        }
        if (!cxt.route)
            return;
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
    #getRoute(cxt) {
        for (var route of this.routes) {
            if (route.test(cxt.path))
                return route;
        }
        return null;
    }
    #execute(action) {
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
        let action = this.callbacks.shift();
        let result = action.handler(action.context);
        if (result && result.then) {
            result.then(() => {
                trigger(document, 'route:' + action.type, action.context);
                ;
                this.#fireNext();
            });
        }
        else {
            this.#fireNext();
            trigger(document, 'route:' + action.type, action.context);
        }
    }
    onPopState(e) {
        if (!e.state || !e.state.url)
            return;
        this.#dispatch(new RouterContext(e.state.url, e.state));
    }
    onClick(e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented)
            return;
        let el = e.target;
        while (el && el.nodeName !== 'A') {
            el = el.parentNode;
        }
        if (!el || el.nodeName !== 'A')
            return;
        let href = el.getAttribute('href');
        if (!href)
            return;
        if (this.onLinkClick && this.onLinkClick({ target: el }) === false) {
            return;
        }
        if (href.indexOf('://') > -1 || href.indexOf('mailto:') > -1) {
            return;
        }
        let cxt = new RouterContext(href, null);
        cxt.route = this.#getRoute(cxt);
        if (!cxt.route)
            return;
        cxt.clickEvent = e;
        cxt.target = el;
        e.preventDefault();
        this.#navigate(cxt);
    }
}
export class RouterContext {
    url;
    hash;
    prevpath;
    nextpath;
    state;
    title = null;
    params;
    route;
    clickEvent;
    target;
    init = false;
    replace = false;
    constructor(url, state) {
        this.url = url;
        this.state = state || {};
        this.state.url = url;
    }
    get path() {
        let queryIndex = this.url.indexOf('?');
        return (queryIndex > 0)
            ? this.url.substring(0, queryIndex)
            : this.url;
    }
    save() {
        history.replaceState(this.state, this.title, this.url + this.hash);
    }
}
export class Route {
    url;
    paramNames = [];
    regexp;
    load;
    unload;
    constructor(url, fn) {
        this.url = url;
        if (typeof fn === 'function') {
            this.load = fn;
        }
        else {
            this.load = fn.load.bind(fn);
            this.unload = fn.unload.bind(fn);
        }
        const re = /{([^}]+)}/g;
        var re2 = url;
        var item;
        while (item = re.exec(url)) {
            this.paramNames.push(item[1]);
            re2 = re2.replace(item[0], '\s*(.*)\s*');
        }
        this.regexp = new RegExp(re2 + '$', 'i');
    }
    params(path) {
        let match = this.regexp.exec(path);
        if (!match)
            return null;
        let params = {};
        for (var i = 1; i < match.length; i++) {
            params[this.paramNames[i - 1]] = match[i];
        }
        return params;
    }
    test(path) {
        return !!this.regexp.test(path);
    }
}
function trigger(element, name, detail) {
    return element.dispatchEvent(new CustomEvent(name, {
        bubbles: true,
        detail: detail
    }));
}
class EventHandler {
    element;
    type;
    handler;
    useCapture;
    constructor(element, type, handler, useCapture = false) {
        this.element = element;
        this.type = type;
        this.handler = handler;
        this.useCapture = useCapture;
        this.element.addEventListener(type, handler, useCapture);
    }
    stop() {
        this.element.removeEventListener(this.type, this.handler, this.useCapture);
    }
}
export class RouteAction {
    type;
    handler;
    context;
    constructor(type, handler, context) {
        this.type = type;
        this.handler = handler;
        this.context = context;
    }
}
