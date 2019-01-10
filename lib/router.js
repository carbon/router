var Carbon;
(function (Carbon) {
    var Router = (function () {
        function Router(routes) {
            this.routes = [];
            this.callbacks = [];
            this.context = null;
            this.executing = false;
            if (routes && typeof routes == 'object') {
                for (var _i = 0, _a = Object.keys(routes); _i < _a.length; _i++) {
                    var key = _a[_i];
                    this.route(key, routes[key]);
                }
            }
            Router.instance = this;
        }
        Router.prototype.start = function () {
            this.popObserver = new EventHandler(window, 'popstate', this.onPopState.bind(this), false);
            this.clickObserver = new EventHandler(window, 'click', this.onClick.bind(this), true);
            var cxt = new RouterContext(location.pathname + location.search, null);
            cxt.hash = location.hash;
            cxt.init = true;
            cxt.save();
            this._dispatch(cxt);
        };
        Router.prototype.on = function (type, listener) {
            document.addEventListener(type, listener, false);
        };
        Router.prototype.stop = function () {
            this.popObserver.stop();
            this.clickObserver.stop();
        };
        Router.prototype.route = function (path, handler) {
            this.routes.push(new Route(path, handler));
        };
        Router.prototype.navigate = function (url, options) {
            var cxt = new RouterContext(url, null);
            if (options && options.replace)
                cxt.replace = true;
            this._navigate(cxt);
        };
        Router.prototype._navigate = function (cxt) {
            var result = trigger(document, 'router:navigate', cxt);
            if (result === false)
                return;
            if (this.beforeNavigate) {
                var result_1 = this.beforeNavigate(cxt);
                if (result_1 === false) {
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
            this._dispatch(cxt);
        };
        Router.prototype._dispatch = function (cxt) {
            var context = this.context;
            if (context && context.route.unload) {
                context.nextpath = cxt.path;
                this._execute(new RouteAction('unload', context.route.unload, context));
            }
            if (!cxt.route) {
                cxt.route = this._getRoute(cxt);
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
            this._execute(new RouteAction('load', cxt.route.load, cxt));
            this.context = cxt;
        };
        Router.prototype._getRoute = function (cxt) {
            for (var _i = 0, _a = this.routes; _i < _a.length; _i++) {
                var route = _a[_i];
                if (route.test(cxt.path))
                    return route;
            }
            return null;
        };
        Router.prototype._execute = function (action) {
            this.callbacks.push(action);
            if (!this.executing) {
                this._fireNext();
            }
        };
        Router.prototype._fireNext = function () {
            var _this = this;
            if (this.callbacks.length === 0) {
                this.executing = false;
                return;
            }
            this.executing = true;
            var action = this.callbacks.shift();
            var result = action.handler(action.context);
            if (result && result.then) {
                result.then(function () {
                    trigger(document, 'route:' + action.type, action.context);
                    ;
                    _this._fireNext();
                });
            }
            else {
                this._fireNext();
                trigger(document, 'route:' + action.type, action.context);
            }
        };
        Router.prototype.onPopState = function (e) {
            if (!e.state || !e.state.url)
                return;
            this._dispatch(new RouterContext(e.state.url, e.state));
        };
        Router.prototype.onClick = function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented)
                return;
            var el = e.target;
            while (el && el.nodeName !== 'A') {
                el = el.parentNode;
            }
            if (!el || el.nodeName !== 'A')
                return;
            var href = el.getAttribute('href');
            if (!href)
                return;
            if (href.indexOf('://') > -1 || href.indexOf('mailto:') > -1)
                return;
            var cxt = new RouterContext(href, null);
            cxt.route = this._getRoute(cxt);
            if (!cxt.route)
                return;
            cxt.clickEvent = e;
            cxt.target = el;
            e.preventDefault();
            this._navigate(cxt);
        };
        return Router;
    }());
    Carbon.Router = Router;
    var RouterContext = (function () {
        function RouterContext(url, state) {
            this.title = null;
            this.init = false;
            this.replace = false;
            this.url = url;
            this.state = state || {};
            this.state.url = url;
        }
        Object.defineProperty(RouterContext.prototype, "path", {
            get: function () {
                var queryIndex = this.url.indexOf('?');
                return (queryIndex > 0)
                    ? this.url.substring(0, queryIndex)
                    : this.url;
            },
            enumerable: true,
            configurable: true
        });
        RouterContext.prototype.save = function () {
            history.replaceState(this.state, this.title, this.url + this.hash);
        };
        return RouterContext;
    }());
    Carbon.RouterContext = RouterContext;
    var Route = (function () {
        function Route(url, fn) {
            this.paramNames = [];
            this.url = url;
            if (typeof fn === 'function') {
                this.load = fn;
            }
            else {
                this.load = fn.load.bind(fn);
                this.unload = fn.unload.bind(fn);
            }
            var re = /{([^}]+)}/g;
            var re2 = url;
            var item;
            while (item = re.exec(url)) {
                this.paramNames.push(item[1]);
                re2 = re2.replace(item[0], '\s*(.*)\s*');
            }
            this.regexp = new RegExp(re2 + '$', 'i');
        }
        Route.prototype.params = function (path) {
            var match = this.regexp.exec(path);
            if (!match)
                return null;
            var params = {};
            for (var i = 1; i < match.length; i++) {
                params[this.paramNames[i - 1]] = match[i];
            }
            return params;
        };
        Route.prototype.test = function (path) {
            return !!this.regexp.test(path);
        };
        return Route;
    }());
    Carbon.Route = Route;
    function trigger(element, name, detail) {
        return element.dispatchEvent(new CustomEvent(name, {
            bubbles: true,
            detail: detail
        }));
    }
    var EventHandler = (function () {
        function EventHandler(element, type, handler, useCapture) {
            if (useCapture === void 0) { useCapture = false; }
            this.element = element;
            this.type = type;
            this.handler = handler;
            this.useCapture = useCapture;
            this.element.addEventListener(type, handler, useCapture);
        }
        EventHandler.prototype.stop = function () {
            this.element.removeEventListener(this.type, this.handler, this.useCapture);
        };
        return EventHandler;
    }());
    var RouteAction = (function () {
        function RouteAction(type, handler, context) {
            this.type = type;
            this.handler = handler;
            this.context = context;
        }
        return RouteAction;
    }());
})(Carbon || (Carbon = {}));
