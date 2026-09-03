(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // node_modules/@capacitor/core/dist/index.js
  var createCapacitorPlatforms, initPlatforms, CapacitorPlatforms, addPlatform, setPlatform, ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor, registerPlugin, Plugins, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp;
  var init_dist = __esm({
    "node_modules/@capacitor/core/dist/index.js"() {
      createCapacitorPlatforms = (win) => {
        const defaultPlatformMap = /* @__PURE__ */ new Map();
        defaultPlatformMap.set("web", { name: "web" });
        const capPlatforms = win.CapacitorPlatforms || {
          currentPlatform: { name: "web" },
          platforms: defaultPlatformMap
        };
        const addPlatform2 = (name, platform) => {
          capPlatforms.platforms.set(name, platform);
        };
        const setPlatform2 = (name) => {
          if (capPlatforms.platforms.has(name)) {
            capPlatforms.currentPlatform = capPlatforms.platforms.get(name);
          }
        };
        capPlatforms.addPlatform = addPlatform2;
        capPlatforms.setPlatform = setPlatform2;
        return capPlatforms;
      };
      initPlatforms = (win) => win.CapacitorPlatforms = createCapacitorPlatforms(win);
      CapacitorPlatforms = /* @__PURE__ */ initPlatforms(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      addPlatform = CapacitorPlatforms.addPlatform;
      setPlatform = CapacitorPlatforms.setPlatform;
      (function(ExceptionCode2) {
        ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
        ExceptionCode2["Unavailable"] = "UNAVAILABLE";
      })(ExceptionCode || (ExceptionCode = {}));
      CapacitorException = class extends Error {
        constructor(message, code, data) {
          super(message);
          this.message = message;
          this.code = code;
          this.data = data;
        }
      };
      getPlatformId = (win) => {
        var _a, _b;
        if (win === null || win === void 0 ? void 0 : win.androidBridge) {
          return "android";
        } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
          return "ios";
        } else {
          return "web";
        }
      };
      createCapacitor = (win) => {
        var _a, _b, _c, _d, _e;
        const capCustomPlatform = win.CapacitorCustomPlatform || null;
        const cap = win.Capacitor || {};
        const Plugins2 = cap.Plugins = cap.Plugins || {};
        const capPlatforms = win.CapacitorPlatforms;
        const defaultGetPlatform = () => {
          return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
        };
        const getPlatform = ((_a = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _a === void 0 ? void 0 : _a.getPlatform) || defaultGetPlatform;
        const defaultIsNativePlatform = () => getPlatform() !== "web";
        const isNativePlatform = ((_b = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _b === void 0 ? void 0 : _b.isNativePlatform) || defaultIsNativePlatform;
        const defaultIsPluginAvailable = (pluginName) => {
          const plugin = registeredPlugins.get(pluginName);
          if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
            return true;
          }
          if (getPluginHeader(pluginName)) {
            return true;
          }
          return false;
        };
        const isPluginAvailable = ((_c = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _c === void 0 ? void 0 : _c.isPluginAvailable) || defaultIsPluginAvailable;
        const defaultGetPluginHeader = (pluginName) => {
          var _a2;
          return (_a2 = cap.PluginHeaders) === null || _a2 === void 0 ? void 0 : _a2.find((h) => h.name === pluginName);
        };
        const getPluginHeader = ((_d = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _d === void 0 ? void 0 : _d.getPluginHeader) || defaultGetPluginHeader;
        const handleError = (err) => win.console.error(err);
        const pluginMethodNoop = (_target, prop, pluginName) => {
          return Promise.reject(`${pluginName} does not have an implementation of "${prop}".`);
        };
        const registeredPlugins = /* @__PURE__ */ new Map();
        const defaultRegisterPlugin = (pluginName, jsImplementations = {}) => {
          const registeredPlugin = registeredPlugins.get(pluginName);
          if (registeredPlugin) {
            console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
            return registeredPlugin.proxy;
          }
          const platform = getPlatform();
          const pluginHeader = getPluginHeader(pluginName);
          let jsImplementation;
          const loadPluginImplementation = async () => {
            if (!jsImplementation && platform in jsImplementations) {
              jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
            } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
              jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
            }
            return jsImplementation;
          };
          const createPluginMethod = (impl, prop) => {
            var _a2, _b2;
            if (pluginHeader) {
              const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
              if (methodHeader) {
                if (methodHeader.rtype === "promise") {
                  return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                } else {
                  return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                }
              } else if (impl) {
                return (_a2 = impl[prop]) === null || _a2 === void 0 ? void 0 : _a2.bind(impl);
              }
            } else if (impl) {
              return (_b2 = impl[prop]) === null || _b2 === void 0 ? void 0 : _b2.bind(impl);
            } else {
              throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          };
          const createPluginMethodWrapper = (prop) => {
            let remove;
            const wrapper = (...args) => {
              const p = loadPluginImplementation().then((impl) => {
                const fn = createPluginMethod(impl, prop);
                if (fn) {
                  const p2 = fn(...args);
                  remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                  return p2;
                } else {
                  throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                }
              });
              if (prop === "addListener") {
                p.remove = async () => remove();
              }
              return p;
            };
            wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
            Object.defineProperty(wrapper, "name", {
              value: prop,
              writable: false,
              configurable: false
            });
            return wrapper;
          };
          const addListener = createPluginMethodWrapper("addListener");
          const removeListener = createPluginMethodWrapper("removeListener");
          const addListenerNative = (eventName, callback) => {
            const call = addListener({ eventName }, callback);
            const remove = async () => {
              const callbackId = await call;
              removeListener({
                eventName,
                callbackId
              }, callback);
            };
            const p = new Promise((resolve) => call.then(() => resolve({ remove })));
            p.remove = async () => {
              console.warn(`Using addListener() without 'await' is deprecated.`);
              await remove();
            };
            return p;
          };
          const proxy = new Proxy({}, {
            get(_, prop) {
              switch (prop) {
                // https://github.com/facebook/react/issues/20030
                case "$$typeof":
                  return void 0;
                case "toJSON":
                  return () => ({});
                case "addListener":
                  return pluginHeader ? addListenerNative : addListener;
                case "removeListener":
                  return removeListener;
                default:
                  return createPluginMethodWrapper(prop);
              }
            }
          });
          Plugins2[pluginName] = proxy;
          registeredPlugins.set(pluginName, {
            name: pluginName,
            proxy,
            platforms: /* @__PURE__ */ new Set([
              ...Object.keys(jsImplementations),
              ...pluginHeader ? [platform] : []
            ])
          });
          return proxy;
        };
        const registerPlugin2 = ((_e = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _e === void 0 ? void 0 : _e.registerPlugin) || defaultRegisterPlugin;
        if (!cap.convertFileSrc) {
          cap.convertFileSrc = (filePath) => filePath;
        }
        cap.getPlatform = getPlatform;
        cap.handleError = handleError;
        cap.isNativePlatform = isNativePlatform;
        cap.isPluginAvailable = isPluginAvailable;
        cap.pluginMethodNoop = pluginMethodNoop;
        cap.registerPlugin = registerPlugin2;
        cap.Exception = CapacitorException;
        cap.DEBUG = !!cap.DEBUG;
        cap.isLoggingEnabled = !!cap.isLoggingEnabled;
        cap.platform = cap.getPlatform();
        cap.isNative = cap.isNativePlatform();
        return cap;
      };
      initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
      Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      registerPlugin = Capacitor.registerPlugin;
      Plugins = Capacitor.Plugins;
      WebPlugin = class {
        constructor(config) {
          this.listeners = {};
          this.retainedEventArguments = {};
          this.windowListeners = {};
          if (config) {
            console.warn(`Capacitor WebPlugin "${config.name}" config object was deprecated in v3 and will be removed in v4.`);
            this.config = config;
          }
        }
        addListener(eventName, listenerFunc) {
          let firstListener = false;
          const listeners = this.listeners[eventName];
          if (!listeners) {
            this.listeners[eventName] = [];
            firstListener = true;
          }
          this.listeners[eventName].push(listenerFunc);
          const windowListener = this.windowListeners[eventName];
          if (windowListener && !windowListener.registered) {
            this.addWindowListener(windowListener);
          }
          if (firstListener) {
            this.sendRetainedArgumentsForEvent(eventName);
          }
          const remove = async () => this.removeListener(eventName, listenerFunc);
          const p = Promise.resolve({ remove });
          return p;
        }
        async removeAllListeners() {
          this.listeners = {};
          for (const listener in this.windowListeners) {
            this.removeWindowListener(this.windowListeners[listener]);
          }
          this.windowListeners = {};
        }
        notifyListeners(eventName, data, retainUntilConsumed) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            if (retainUntilConsumed) {
              let args = this.retainedEventArguments[eventName];
              if (!args) {
                args = [];
              }
              args.push(data);
              this.retainedEventArguments[eventName] = args;
            }
            return;
          }
          listeners.forEach((listener) => listener(data));
        }
        hasListeners(eventName) {
          return !!this.listeners[eventName].length;
        }
        registerWindowListener(windowEventName, pluginEventName) {
          this.windowListeners[pluginEventName] = {
            registered: false,
            windowEventName,
            pluginEventName,
            handler: (event) => {
              this.notifyListeners(pluginEventName, event);
            }
          };
        }
        unimplemented(msg = "not implemented") {
          return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
        }
        unavailable(msg = "not available") {
          return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
        }
        async removeListener(eventName, listenerFunc) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            return;
          }
          const index = listeners.indexOf(listenerFunc);
          this.listeners[eventName].splice(index, 1);
          if (!this.listeners[eventName].length) {
            this.removeWindowListener(this.windowListeners[eventName]);
          }
        }
        addWindowListener(handle) {
          window.addEventListener(handle.windowEventName, handle.handler);
          handle.registered = true;
        }
        removeWindowListener(handle) {
          if (!handle) {
            return;
          }
          window.removeEventListener(handle.windowEventName, handle.handler);
          handle.registered = false;
        }
        sendRetainedArgumentsForEvent(eventName) {
          const args = this.retainedEventArguments[eventName];
          if (!args) {
            return;
          }
          delete this.retainedEventArguments[eventName];
          args.forEach((arg) => {
            this.notifyListeners(eventName, arg);
          });
        }
      };
      encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
      decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
      CapacitorCookiesPluginWeb = class extends WebPlugin {
        async getCookies() {
          const cookies = document.cookie;
          const cookieMap = {};
          cookies.split(";").forEach((cookie) => {
            if (cookie.length <= 0)
              return;
            let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
            key = decode(key).trim();
            value = decode(value).trim();
            cookieMap[key] = value;
          });
          return cookieMap;
        }
        async setCookie(options) {
          try {
            const encodedKey = encode(options.key);
            const encodedValue = encode(options.value);
            const expires = `; expires=${(options.expires || "").replace("expires=", "")}`;
            const path = (options.path || "/").replace("path=", "");
            const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
            document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async deleteCookie(options) {
          try {
            document.cookie = `${options.key}=; Max-Age=0`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearCookies() {
          try {
            const cookies = document.cookie.split(";") || [];
            for (const cookie of cookies) {
              document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
            }
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearAllCookies() {
          try {
            await this.clearCookies();
          } catch (error) {
            return Promise.reject(error);
          }
        }
      };
      CapacitorCookies = registerPlugin("CapacitorCookies", {
        web: () => new CapacitorCookiesPluginWeb()
      });
      readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result;
          resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
      normalizeHttpHeaders = (headers = {}) => {
        const originalKeys = Object.keys(headers);
        const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
        const normalized = loweredKeys.reduce((acc, key, index) => {
          acc[key] = headers[originalKeys[index]];
          return acc;
        }, {});
        return normalized;
      };
      buildUrlParams = (params, shouldEncode = true) => {
        if (!params)
          return null;
        const output = Object.entries(params).reduce((accumulator, entry) => {
          const [key, value] = entry;
          let encodedValue;
          let item;
          if (Array.isArray(value)) {
            item = "";
            value.forEach((str) => {
              encodedValue = shouldEncode ? encodeURIComponent(str) : str;
              item += `${key}=${encodedValue}&`;
            });
            item.slice(0, -1);
          } else {
            encodedValue = shouldEncode ? encodeURIComponent(value) : value;
            item = `${key}=${encodedValue}`;
          }
          return `${accumulator}&${item}`;
        }, "");
        return output.substr(1);
      };
      buildRequestInit = (options, extra = {}) => {
        const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
        const headers = normalizeHttpHeaders(options.headers);
        const type = headers["content-type"] || "";
        if (typeof options.data === "string") {
          output.body = options.data;
        } else if (type.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(options.data || {})) {
            params.set(key, value);
          }
          output.body = params.toString();
        } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
          const form = new FormData();
          if (options.data instanceof FormData) {
            options.data.forEach((value, key) => {
              form.append(key, value);
            });
          } else {
            for (const key of Object.keys(options.data)) {
              form.append(key, options.data[key]);
            }
          }
          output.body = form;
          const headers2 = new Headers(output.headers);
          headers2.delete("content-type");
          output.headers = headers2;
        } else if (type.includes("application/json") || typeof options.data === "object") {
          output.body = JSON.stringify(options.data);
        }
        return output;
      };
      CapacitorHttpPluginWeb = class extends WebPlugin {
        /**
         * Perform an Http request given a set of options
         * @param options Options to build the HTTP request
         */
        async request(options) {
          const requestInit = buildRequestInit(options, options.webFetchExtra);
          const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
          const url = urlParams ? `${options.url}?${urlParams}` : options.url;
          const response = await fetch(url, requestInit);
          const contentType = response.headers.get("content-type") || "";
          let { responseType = "text" } = response.ok ? options : {};
          if (contentType.includes("application/json")) {
            responseType = "json";
          }
          let data;
          let blob;
          switch (responseType) {
            case "arraybuffer":
            case "blob":
              blob = await response.blob();
              data = await readBlobAsBase64(blob);
              break;
            case "json":
              data = await response.json();
              break;
            case "document":
            case "text":
            default:
              data = await response.text();
          }
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            data,
            headers,
            status: response.status,
            url: response.url
          };
        }
        /**
         * Perform an Http GET request given a set of options
         * @param options Options to build the HTTP request
         */
        async get(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
        }
        /**
         * Perform an Http POST request given a set of options
         * @param options Options to build the HTTP request
         */
        async post(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
        }
        /**
         * Perform an Http PUT request given a set of options
         * @param options Options to build the HTTP request
         */
        async put(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
        }
        /**
         * Perform an Http PATCH request given a set of options
         * @param options Options to build the HTTP request
         */
        async patch(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
        }
        /**
         * Perform an Http DELETE request given a set of options
         * @param options Options to build the HTTP request
         */
        async delete(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
        }
      };
      CapacitorHttp = registerPlugin("CapacitorHttp", {
        web: () => new CapacitorHttpPluginWeb()
      });
    }
  });

  // node_modules/@capacitor/app/dist/esm/web.js
  var web_exports = {};
  __export(web_exports, {
    AppWeb: () => AppWeb
  });
  var AppWeb;
  var init_web = __esm({
    "node_modules/@capacitor/app/dist/esm/web.js"() {
      init_dist();
      AppWeb = class extends WebPlugin {
        constructor() {
          super();
          this.handleVisibilityChange = () => {
            const data = {
              isActive: document.hidden !== true
            };
            this.notifyListeners("appStateChange", data);
            if (document.hidden) {
              this.notifyListeners("pause", null);
            } else {
              this.notifyListeners("resume", null);
            }
          };
          document.addEventListener("visibilitychange", this.handleVisibilityChange, false);
        }
        exitApp() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getInfo() {
          throw this.unimplemented("Not implemented on web.");
        }
        async getLaunchUrl() {
          return { url: "" };
        }
        async getState() {
          return { isActive: document.hidden !== true };
        }
        async minimizeApp() {
          throw this.unimplemented("Not implemented on web.");
        }
      };
    }
  });

  // node_modules/@capacitor/geolocation/dist/esm/web.js
  var web_exports2 = {};
  __export(web_exports2, {
    Geolocation: () => Geolocation,
    GeolocationWeb: () => GeolocationWeb
  });
  var GeolocationWeb, Geolocation;
  var init_web2 = __esm({
    "node_modules/@capacitor/geolocation/dist/esm/web.js"() {
      init_dist();
      GeolocationWeb = class extends WebPlugin {
        async getCurrentPosition(options) {
          return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition((pos) => {
              resolve(pos);
            }, (err) => {
              reject(err);
            }, Object.assign({ enableHighAccuracy: false, timeout: 1e4, maximumAge: 0 }, options));
          });
        }
        async watchPosition(options, callback) {
          const id = navigator.geolocation.watchPosition((pos) => {
            callback(pos);
          }, (err) => {
            callback(null, err);
          }, Object.assign({ enableHighAccuracy: false, timeout: 1e4, maximumAge: 0, minimumUpdateInterval: 5e3 }, options));
          return `${id}`;
        }
        async clearWatch(options) {
          window.navigator.geolocation.clearWatch(parseInt(options.id, 10));
        }
        async checkPermissions() {
          if (typeof navigator === "undefined" || !navigator.permissions) {
            throw this.unavailable("Permissions API not available in this browser");
          }
          const permission = await window.navigator.permissions.query({
            name: "geolocation"
          });
          return { location: permission.state, coarseLocation: permission.state };
        }
        async requestPermissions() {
          throw this.unimplemented("Not implemented on web.");
        }
      };
      Geolocation = new GeolocationWeb();
    }
  });

  // node_modules/@capacitor/haptics/dist/esm/definitions.js
  var ImpactStyle, NotificationType;
  var init_definitions = __esm({
    "node_modules/@capacitor/haptics/dist/esm/definitions.js"() {
      (function(ImpactStyle2) {
        ImpactStyle2["Heavy"] = "HEAVY";
        ImpactStyle2["Medium"] = "MEDIUM";
        ImpactStyle2["Light"] = "LIGHT";
      })(ImpactStyle || (ImpactStyle = {}));
      (function(NotificationType2) {
        NotificationType2["Success"] = "SUCCESS";
        NotificationType2["Warning"] = "WARNING";
        NotificationType2["Error"] = "ERROR";
      })(NotificationType || (NotificationType = {}));
    }
  });

  // node_modules/@capacitor/haptics/dist/esm/web.js
  var web_exports3 = {};
  __export(web_exports3, {
    HapticsWeb: () => HapticsWeb
  });
  var HapticsWeb;
  var init_web3 = __esm({
    "node_modules/@capacitor/haptics/dist/esm/web.js"() {
      init_dist();
      init_definitions();
      HapticsWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.selectionStarted = false;
        }
        async impact(options) {
          const pattern = this.patternForImpact(options === null || options === void 0 ? void 0 : options.style);
          this.vibrateWithPattern(pattern);
        }
        async notification(options) {
          const pattern = this.patternForNotification(options === null || options === void 0 ? void 0 : options.type);
          this.vibrateWithPattern(pattern);
        }
        async vibrate(options) {
          const duration = (options === null || options === void 0 ? void 0 : options.duration) || 300;
          this.vibrateWithPattern([duration]);
        }
        async selectionStart() {
          this.selectionStarted = true;
        }
        async selectionChanged() {
          if (this.selectionStarted) {
            this.vibrateWithPattern([70]);
          }
        }
        async selectionEnd() {
          this.selectionStarted = false;
        }
        patternForImpact(style = ImpactStyle.Heavy) {
          if (style === ImpactStyle.Medium) {
            return [43];
          } else if (style === ImpactStyle.Light) {
            return [20];
          }
          return [61];
        }
        patternForNotification(type = NotificationType.Success) {
          if (type === NotificationType.Warning) {
            return [30, 40, 30, 50, 60];
          } else if (type === NotificationType.Error) {
            return [27, 45, 50];
          }
          return [35, 65, 21];
        }
        vibrateWithPattern(pattern) {
          if (navigator.vibrate) {
            navigator.vibrate(pattern);
          } else {
            throw this.unavailable("Browser does not support the vibrate API");
          }
        }
      };
    }
  });

  // node_modules/@capacitor/local-notifications/dist/esm/web.js
  var web_exports4 = {};
  __export(web_exports4, {
    LocalNotificationsWeb: () => LocalNotificationsWeb
  });
  var LocalNotificationsWeb;
  var init_web4 = __esm({
    "node_modules/@capacitor/local-notifications/dist/esm/web.js"() {
      init_dist();
      LocalNotificationsWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.pending = [];
          this.deliveredNotifications = [];
          this.hasNotificationSupport = () => {
            if (!("Notification" in window) || !Notification.requestPermission) {
              return false;
            }
            if (Notification.permission !== "granted") {
              try {
                new Notification("");
              } catch (e) {
                if (e.name == "TypeError") {
                  return false;
                }
              }
            }
            return true;
          };
        }
        async getDeliveredNotifications() {
          const deliveredSchemas = [];
          for (const notification of this.deliveredNotifications) {
            const deliveredSchema = {
              title: notification.title,
              id: parseInt(notification.tag),
              body: notification.body
            };
            deliveredSchemas.push(deliveredSchema);
          }
          return {
            notifications: deliveredSchemas
          };
        }
        async removeDeliveredNotifications(delivered) {
          for (const toRemove of delivered.notifications) {
            const found = this.deliveredNotifications.find((n) => n.tag === String(toRemove.id));
            found === null || found === void 0 ? void 0 : found.close();
            this.deliveredNotifications = this.deliveredNotifications.filter(() => !found);
          }
        }
        async removeAllDeliveredNotifications() {
          for (const notification of this.deliveredNotifications) {
            notification.close();
          }
          this.deliveredNotifications = [];
        }
        async createChannel() {
          throw this.unimplemented("Not implemented on web.");
        }
        async deleteChannel() {
          throw this.unimplemented("Not implemented on web.");
        }
        async listChannels() {
          throw this.unimplemented("Not implemented on web.");
        }
        async schedule(options) {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          for (const notification of options.notifications) {
            this.sendNotification(notification);
          }
          return {
            notifications: options.notifications.map((notification) => ({
              id: notification.id
            }))
          };
        }
        async getPending() {
          return {
            notifications: this.pending
          };
        }
        async registerActionTypes() {
          throw this.unimplemented("Not implemented on web.");
        }
        async cancel(pending) {
          this.pending = this.pending.filter((notification) => !pending.notifications.find((n) => n.id === notification.id));
        }
        async areEnabled() {
          const { display } = await this.checkPermissions();
          return {
            value: display === "granted"
          };
        }
        async changeExactNotificationSetting() {
          throw this.unimplemented("Not implemented on web.");
        }
        async checkExactNotificationSetting() {
          throw this.unimplemented("Not implemented on web.");
        }
        async requestPermissions() {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          const display = this.transformNotificationPermission(await Notification.requestPermission());
          return { display };
        }
        async checkPermissions() {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          const display = this.transformNotificationPermission(Notification.permission);
          return { display };
        }
        transformNotificationPermission(permission) {
          switch (permission) {
            case "granted":
              return "granted";
            case "denied":
              return "denied";
            default:
              return "prompt";
          }
        }
        sendPending() {
          var _a;
          const toRemove = [];
          const now = (/* @__PURE__ */ new Date()).getTime();
          for (const notification of this.pending) {
            if (((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) && notification.schedule.at.getTime() <= now) {
              this.buildNotification(notification);
              toRemove.push(notification);
            }
          }
          this.pending = this.pending.filter((notification) => !toRemove.find((n) => n === notification));
        }
        sendNotification(notification) {
          var _a;
          if ((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) {
            const diff = notification.schedule.at.getTime() - (/* @__PURE__ */ new Date()).getTime();
            this.pending.push(notification);
            setTimeout(() => {
              this.sendPending();
            }, diff);
            return;
          }
          this.buildNotification(notification);
        }
        buildNotification(notification) {
          const localNotification = new Notification(notification.title, {
            body: notification.body,
            tag: String(notification.id)
          });
          localNotification.addEventListener("click", this.onClick.bind(this, notification), false);
          localNotification.addEventListener("show", this.onShow.bind(this, notification), false);
          localNotification.addEventListener("close", () => {
            this.deliveredNotifications = this.deliveredNotifications.filter(() => !this);
          }, false);
          this.deliveredNotifications.push(localNotification);
          return localNotification;
        }
        onClick(notification) {
          const data = {
            actionId: "tap",
            notification
          };
          this.notifyListeners("localNotificationActionPerformed", data);
        }
        onShow(notification) {
          this.notifyListeners("localNotificationReceived", notification);
        }
      };
    }
  });

  // node_modules/@capacitor/network/dist/esm/web.js
  var web_exports5 = {};
  __export(web_exports5, {
    Network: () => Network,
    NetworkWeb: () => NetworkWeb
  });
  function translatedConnection() {
    const connection = window.navigator.connection || window.navigator.mozConnection || window.navigator.webkitConnection;
    let result = "unknown";
    const type = connection ? connection.type || connection.effectiveType : null;
    if (type && typeof type === "string") {
      switch (type) {
        // possible type values
        case "bluetooth":
        case "cellular":
          result = "cellular";
          break;
        case "none":
          result = "none";
          break;
        case "ethernet":
        case "wifi":
        case "wimax":
          result = "wifi";
          break;
        case "other":
        case "unknown":
          result = "unknown";
          break;
        // possible effectiveType values
        case "slow-2g":
        case "2g":
        case "3g":
          result = "cellular";
          break;
        case "4g":
          result = "wifi";
          break;
        default:
          break;
      }
    }
    return result;
  }
  var NetworkWeb, Network;
  var init_web5 = __esm({
    "node_modules/@capacitor/network/dist/esm/web.js"() {
      init_dist();
      NetworkWeb = class extends WebPlugin {
        constructor() {
          super();
          this.handleOnline = () => {
            const connectionType = translatedConnection();
            const status = {
              connected: true,
              connectionType
            };
            this.notifyListeners("networkStatusChange", status);
          };
          this.handleOffline = () => {
            const status = {
              connected: false,
              connectionType: "none"
            };
            this.notifyListeners("networkStatusChange", status);
          };
          if (typeof window !== "undefined") {
            window.addEventListener("online", this.handleOnline);
            window.addEventListener("offline", this.handleOffline);
          }
        }
        async getStatus() {
          if (!window.navigator) {
            throw this.unavailable("Browser does not support the Network Information API");
          }
          const connected = window.navigator.onLine;
          const connectionType = translatedConnection();
          const status = {
            connected,
            connectionType: connected ? connectionType : "none"
          };
          return status;
        }
      };
      Network = new NetworkWeb();
    }
  });

  // node_modules/@capacitor/preferences/dist/esm/web.js
  var web_exports6 = {};
  __export(web_exports6, {
    PreferencesWeb: () => PreferencesWeb
  });
  var PreferencesWeb;
  var init_web6 = __esm({
    "node_modules/@capacitor/preferences/dist/esm/web.js"() {
      init_dist();
      PreferencesWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.group = "CapacitorStorage";
        }
        async configure({ group }) {
          if (typeof group === "string") {
            this.group = group;
          }
        }
        async get(options) {
          const value = this.impl.getItem(this.applyPrefix(options.key));
          return { value };
        }
        async set(options) {
          this.impl.setItem(this.applyPrefix(options.key), options.value);
        }
        async remove(options) {
          this.impl.removeItem(this.applyPrefix(options.key));
        }
        async keys() {
          const keys = this.rawKeys().map((k) => k.substring(this.prefix.length));
          return { keys };
        }
        async clear() {
          for (const key of this.rawKeys()) {
            this.impl.removeItem(key);
          }
        }
        async migrate() {
          var _a;
          const migrated = [];
          const existing = [];
          const oldprefix = "_cap_";
          const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
          for (const oldkey of keys) {
            const key = oldkey.substring(oldprefix.length);
            const value = (_a = this.impl.getItem(oldkey)) !== null && _a !== void 0 ? _a : "";
            const { value: currentValue } = await this.get({ key });
            if (typeof currentValue === "string") {
              existing.push(key);
            } else {
              await this.set({ key, value });
              migrated.push(key);
            }
          }
          return { migrated, existing };
        }
        async removeOld() {
          const oldprefix = "_cap_";
          const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
          for (const oldkey of keys) {
            this.impl.removeItem(oldkey);
          }
        }
        get impl() {
          return window.localStorage;
        }
        get prefix() {
          return this.group === "NativeStorage" ? "" : `${this.group}.`;
        }
        rawKeys() {
          return Object.keys(this.impl).filter((k) => k.indexOf(this.prefix) === 0);
        }
        applyPrefix(key) {
          return this.prefix + key;
        }
      };
    }
  });

  // node_modules/@capacitor/share/dist/esm/web.js
  var web_exports7 = {};
  __export(web_exports7, {
    ShareWeb: () => ShareWeb
  });
  var ShareWeb;
  var init_web7 = __esm({
    "node_modules/@capacitor/share/dist/esm/web.js"() {
      init_dist();
      ShareWeb = class extends WebPlugin {
        async canShare() {
          if (typeof navigator === "undefined" || !navigator.share) {
            return { value: false };
          } else {
            return { value: true };
          }
        }
        async share(options) {
          if (typeof navigator === "undefined" || !navigator.share) {
            throw this.unavailable("Share API not available in this browser");
          }
          await navigator.share({
            title: options.title,
            text: options.text,
            url: options.url
          });
          return {};
        }
      };
    }
  });

  // node_modules/@capacitor/splash-screen/dist/esm/web.js
  var web_exports8 = {};
  __export(web_exports8, {
    SplashScreenWeb: () => SplashScreenWeb
  });
  var SplashScreenWeb;
  var init_web8 = __esm({
    "node_modules/@capacitor/splash-screen/dist/esm/web.js"() {
      init_dist();
      SplashScreenWeb = class extends WebPlugin {
        async show(_options) {
          return void 0;
        }
        async hide(_options) {
          return void 0;
        }
      };
    }
  });

  // capacitor-src/main.js
  init_dist();

  // node_modules/@capacitor/app/dist/esm/index.js
  init_dist();
  var App = registerPlugin("App", {
    web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.AppWeb())
  });

  // node_modules/@capacitor/clipboard/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/clipboard/dist/esm/web.js
  init_dist();
  var ClipboardWeb = class extends WebPlugin {
    async write(options) {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw this.unavailable("Clipboard API not available in this browser");
      }
      if (options.string !== void 0) {
        await this.writeText(options.string);
      } else if (options.url) {
        await this.writeText(options.url);
      } else if (options.image) {
        if (typeof ClipboardItem !== "undefined") {
          try {
            const blob = await (await fetch(options.image)).blob();
            const clipboardItemInput = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([clipboardItemInput]);
          } catch (err) {
            throw new Error("Failed to write image");
          }
        } else {
          throw this.unavailable("Writing images to the clipboard is not supported in this browser");
        }
      } else {
        throw new Error("Nothing to write");
      }
    }
    async read() {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw this.unavailable("Clipboard API not available in this browser");
      }
      if (typeof ClipboardItem !== "undefined") {
        try {
          const clipboardItems = await navigator.clipboard.read();
          const type = clipboardItems[0].types[0];
          const clipboardBlob = await clipboardItems[0].getType(type);
          const data = await this._getBlobData(clipboardBlob, type);
          return { value: data, type };
        } catch (err) {
          return this.readText();
        }
      } else {
        return this.readText();
      }
    }
    async readText() {
      if (typeof navigator === "undefined" || !navigator.clipboard || !navigator.clipboard.readText) {
        throw this.unavailable("Reading from clipboard not supported in this browser");
      }
      const text = await navigator.clipboard.readText();
      return { value: text, type: "text/plain" };
    }
    async writeText(text) {
      if (typeof navigator === "undefined" || !navigator.clipboard || !navigator.clipboard.writeText) {
        throw this.unavailable("Writting to clipboard not supported in this browser");
      }
      await navigator.clipboard.writeText(text);
    }
    _getBlobData(clipboardBlob, type) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        if (type.includes("image")) {
          reader.readAsDataURL(clipboardBlob);
        } else {
          reader.readAsText(clipboardBlob);
        }
        reader.onloadend = () => {
          const r = reader.result;
          resolve(r);
        };
        reader.onerror = (e) => {
          reject(e);
        };
      });
    }
  };

  // node_modules/@capacitor/clipboard/dist/esm/index.js
  var Clipboard = registerPlugin("Clipboard", {
    web: () => new ClipboardWeb()
  });

  // node_modules/@capacitor/geolocation/dist/esm/index.js
  init_dist();
  var Geolocation2 = registerPlugin("Geolocation", {
    web: () => Promise.resolve().then(() => (init_web2(), web_exports2)).then((m) => new m.GeolocationWeb())
  });

  // node_modules/@capacitor/haptics/dist/esm/index.js
  init_dist();
  init_definitions();
  var Haptics = registerPlugin("Haptics", {
    web: () => Promise.resolve().then(() => (init_web3(), web_exports3)).then((m) => new m.HapticsWeb())
  });

  // node_modules/@capacitor/local-notifications/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/local-notifications/dist/esm/definitions.js
  var Weekday;
  (function(Weekday2) {
    Weekday2[Weekday2["Sunday"] = 1] = "Sunday";
    Weekday2[Weekday2["Monday"] = 2] = "Monday";
    Weekday2[Weekday2["Tuesday"] = 3] = "Tuesday";
    Weekday2[Weekday2["Wednesday"] = 4] = "Wednesday";
    Weekday2[Weekday2["Thursday"] = 5] = "Thursday";
    Weekday2[Weekday2["Friday"] = 6] = "Friday";
    Weekday2[Weekday2["Saturday"] = 7] = "Saturday";
  })(Weekday || (Weekday = {}));

  // node_modules/@capacitor/local-notifications/dist/esm/index.js
  var LocalNotifications = registerPlugin("LocalNotifications", {
    web: () => Promise.resolve().then(() => (init_web4(), web_exports4)).then((m) => new m.LocalNotificationsWeb())
  });

  // node_modules/@capacitor/network/dist/esm/index.js
  init_dist();
  var Network2 = registerPlugin("Network", {
    web: () => Promise.resolve().then(() => (init_web5(), web_exports5)).then((m) => new m.NetworkWeb())
  });

  // node_modules/@capacitor/preferences/dist/esm/index.js
  init_dist();
  var Preferences = registerPlugin("Preferences", {
    web: () => Promise.resolve().then(() => (init_web6(), web_exports6)).then((m) => new m.PreferencesWeb())
  });

  // node_modules/@capacitor/push-notifications/dist/esm/index.js
  init_dist();
  var PushNotifications = registerPlugin("PushNotifications", {});

  // node_modules/@capacitor/share/dist/esm/index.js
  init_dist();
  var Share = registerPlugin("Share", {
    web: () => Promise.resolve().then(() => (init_web7(), web_exports7)).then((m) => new m.ShareWeb())
  });

  // node_modules/@capacitor/splash-screen/dist/esm/index.js
  init_dist();
  var SplashScreen = registerPlugin("SplashScreen", {
    web: () => Promise.resolve().then(() => (init_web8(), web_exports8)).then((m) => new m.SplashScreenWeb())
  });

  // node_modules/@capacitor/status-bar/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/status-bar/dist/esm/definitions.js
  var Style;
  (function(Style2) {
    Style2["Dark"] = "DARK";
    Style2["Light"] = "LIGHT";
    Style2["Default"] = "DEFAULT";
  })(Style || (Style = {}));
  var Animation;
  (function(Animation2) {
    Animation2["None"] = "NONE";
    Animation2["Slide"] = "SLIDE";
    Animation2["Fade"] = "FADE";
  })(Animation || (Animation = {}));

  // node_modules/@capacitor/status-bar/dist/esm/index.js
  var StatusBar = registerPlugin("StatusBar");

  // capacitor-src/backend.js
  var DAXI_PATH_RE = /^\/(htmx|api|ws|accounts|media)(\/|$)/i;
  function apiDebugEnabled() {
    if (typeof window === "undefined") return false;
    if (window.DAXI_API_DEBUG_LOGS === false) return false;
    if (window.DAXI_API_DEBUG_LOGS === true) return true;
    return String(window.DAXI_API_ENV || "development") !== "production";
  }
  function apiLog(msg, extra) {
    if (!apiDebugEnabled()) return;
    if (extra !== void 0) console.info("[DAXI API]", msg, extra);
    else console.info("[DAXI API]", msg);
  }
  function normalizeBackendUrl(raw, opts) {
    const allowHttp = !!(opts && opts.allowHttp);
    const s = String(raw || "").trim();
    if (!s) {
      return { ok: false, url: "", error: "DAXI_API_BASE_URL is empty" };
    }
    let url = s.replace(/\/+$/, "");
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return { ok: false, url: "", error: "DAXI_API_BASE_URL is not a valid URL" };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, url: "", error: "DAXI_API_BASE_URL must be http(s)" };
    }
    if (parsed.protocol === "http:" && !allowHttp) {
      return { ok: false, url: "", error: "DAXI_API_BASE_URL must use HTTPS (set DAXI_API_ALLOW_HTTP for local http)" };
    }
    url = parsed.origin;
    return { ok: true, url, error: "" };
  }
  function sameOriginHttpBase() {
    try {
      if (typeof location === "undefined") return "";
      if (location.protocol !== "http:" && location.protocol !== "https:") return "";
      return location.origin || "";
    } catch (e) {
      return "";
    }
  }
  function getApiBase() {
    const raw = typeof window !== "undefined" && (window.DAXI_API_BASE_URL || window._daxiLiveBaseUrl) || "";
    const allowHttp = typeof window !== "undefined" && !!window.DAXI_API_ALLOW_HTTP;
    if (!String(raw).trim()) {
      return sameOriginHttpBase();
    }
    const n = normalizeBackendUrl(raw, { allowHttp });
    return n.ok ? n.url : sameOriginHttpBase();
  }
  function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }
  function toWsBase(httpBase) {
    return String(httpBase).replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  }
  function isDaxiBackend(url) {
    const s = String(url || "");
    if (!s || /^(blob:|data:|capacitor:)/i.test(s)) return false;
    if (s.startsWith("/") && DAXI_PATH_RE.test(s)) return true;
    const base = getApiBase();
    try {
      const resolved = new URL(s, base || "https://localhost");
      if (!DAXI_PATH_RE.test(resolved.pathname)) return false;
      if (isLocalHost(resolved.hostname)) return true;
      if (!base) return false;
      return resolved.origin === new URL(base).origin;
    } catch (e) {
      return false;
    }
  }
  function backendUrl(pathOrUrl) {
    const s = String(pathOrUrl || "");
    if (!s) return s;
    if (/^(blob:|data:|capacitor:)/i.test(s)) return s;
    if (/^wss?:\/\//i.test(s)) return s;
    const base = getApiBase();
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        if (isLocalHost(u.hostname) && DAXI_PATH_RE.test(u.pathname) && base) {
          return base + u.pathname + u.search + (u.hash || "");
        }
        return s;
      } catch (e) {
        return s;
      }
    }
    if (s.startsWith("/") && DAXI_PATH_RE.test(s) && base) {
      return base + s;
    }
    return s;
  }
  function nativePageUrl(pathOrUrl) {
    const base = getApiBase();
    const s = String(pathOrUrl || "");
    if (!s || !base) return s;
    if (/^(blob:|data:|capacitor:|mailto:|tel:)/i.test(s)) return s;
    try {
      if (/^https?:\/\//i.test(s)) {
        const u = new URL(s);
        if (isLocalHost(u.hostname)) return base + u.pathname + u.search + (u.hash || "");
        return s;
      }
    } catch (e) {
    }
    if (s.startsWith("/")) return base.replace(/\/$/, "") + s;
    return s;
  }
  function backendWsUrl(pathOrUrl) {
    let s = String(pathOrUrl || "");
    const base = getApiBase();
    if (!base) return s;
    try {
      if (/^https?:\/\//i.test(s)) {
        const u = new URL(s);
        return toWsBase(u.origin) + u.pathname + u.search + (u.hash || "");
      }
      if (/^wss?:\/\//i.test(s)) {
        const u = new URL(s);
        if (!isLocalHost(u.hostname)) return s;
        return toWsBase(base) + u.pathname + u.search + (u.hash || "");
      }
    } catch (e) {
      return s;
    }
    if (!s.startsWith("/")) s = "/" + s.replace(/^\/+/, "");
    return toWsBase(base) + s;
  }
  function classifyHttpStatus(status) {
    const n = Number(status) || 0;
    if (n === 400) return "HTTP_400";
    if (n === 401) return "HTTP_401";
    if (n === 403) return "HTTP_403";
    if (n === 404) return "HTTP_404";
    if (n === 429) return "HTTP_429";
    if (n === 500) return "HTTP_500";
    if (n === 502) return "HTTP_502";
    if (n === 503) return "HTTP_503";
    if (n >= 500) return "HTTP_5xx";
    if (n >= 400) return "HTTP_4xx";
    if (n >= 200 && n < 400) return "HTTP_" + n;
    return "HTTP_UNKNOWN";
  }
  function classifyFetchError(err) {
    const name = err && err.name;
    const msg = String(err && err.message || err || "");
    if (name === "AbortError" || /timeout/i.test(msg)) return "TIMEOUT";
    if (/offline/i.test(msg)) return "NETWORK_ERROR";
    return "NETWORK_ERROR";
  }
  function pathOnly(url) {
    try {
      const u = new URL(url, getApiBase() || "https://localhost");
      return u.pathname + u.search;
    } catch (e) {
      return String(url || "");
    }
  }
  var csrfToken = "";
  function getStoredCsrf() {
    if (csrfToken) return csrfToken;
    try {
      if (typeof window !== "undefined" && window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) {
        csrfToken = String(window.DJANGO_SESSION.csrf_token);
      }
    } catch (e) {
    }
    return csrfToken;
  }
  function rememberCsrfToken(token) {
    const t = String(token || "").trim();
    if (!t) return;
    csrfToken = t;
    try {
      if (typeof window === "undefined") return;
      window.DJANGO_SESSION = window.DJANGO_SESSION || {};
      window.DJANGO_SESSION.csrf_token = t;
    } catch (e) {
    }
  }
  function rememberCsrfFromResponse(res) {
    if (!res || !res.headers) return;
    try {
      const h = res.headers.get("X-CSRFToken") || res.headers.get("x-csrftoken");
      if (h) rememberCsrfToken(h);
    } catch (e) {
    }
  }
  function rememberCsrfFromPayload(data) {
    if (!data || typeof data !== "object") return;
    if (data.csrf_token) rememberCsrfToken(data.csrf_token);
  }
  function attachCsrfHeader(headers, method) {
    const m = (method || "GET").toUpperCase();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS" || !headers) return headers;
    const t = getStoredCsrf();
    if (!t) return headers;
    const existing = headers.get("X-CSRFToken") || headers.get("x-csrftoken") || "";
    if (!String(existing).trim()) headers.set("X-CSRFToken", t);
    return headers;
  }
  function installDaxiApiGlobal() {
    let raw = typeof window !== "undefined" ? window.DAXI_API_BASE_URL || window._daxiLiveBaseUrl : "";
    if (!String(raw).trim()) raw = sameOriginHttpBase();
    const n = normalizeBackendUrl(raw, {
      allowHttp: typeof window !== "undefined" && !!window.DAXI_API_ALLOW_HTTP
    });
    if (!n.ok) {
      apiLog("Invalid configuration:", n.error);
      if (typeof window !== "undefined" && sameOriginHttpBase()) {
        window.DAXI_API_BASE_URL = sameOriginHttpBase();
        window._daxiLiveBaseUrl = window.DAXI_API_BASE_URL;
        apiLog("Base URL (same-origin): " + window.DAXI_API_BASE_URL);
      }
    } else {
      window.DAXI_API_BASE_URL = n.url;
      window._daxiLiveBaseUrl = n.url;
      apiLog("Base URL: " + n.url);
      apiLog("Env: " + (window.DAXI_API_ENV || "development"));
    }
    window.backendUrl = backendUrl;
    window.nativePageUrl = nativePageUrl;
    window.DaxiApi = {
      env: () => window.DAXI_API_ENV || "development",
      baseUrl: getApiBase,
      backendUrl,
      nativePageUrl,
      backendWsUrl,
      normalizeBackendUrl,
      isDaxiBackend,
      classifyHttpStatus,
      lastError: null,
      lastProbe: null,
      getCsrfToken: getStoredCsrf
    };
    return n;
  }

  // capacitor-src/main.js
  var WRITE_RE = /^(POST|PUT|PATCH|DELETE)$/i;
  var API_RE = /\/(htmx|api)\//;
  var BACKEND_FETCH_TIMEOUT_MS = 8e3;
  function liveBase() {
    return getApiBase();
  }
  function absUrl(u) {
    return backendUrl(u);
  }
  function isWrite(method, url) {
    const m = (method || "GET").toUpperCase();
    if (!WRITE_RE.test(m)) return false;
    const s = String(url || "");
    if (API_RE.test(s)) return true;
    if (/\/(order|payment|chat|login|register|wallet|sos|htmx|api)\//i.test(s)) return true;
    return false;
  }
  function toast(msg) {
    let el = document.getElementById("daxi-cap-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "daxi-cap-toast";
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:16px;right:16px;bottom:24px;z-index:99999;background:#0f172a;color:#f8fafc;border:1px solid #f59e0b;border-radius:14px;padding:14px 16px;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.style.display = "none";
    }, 4200);
  }
  function openIdb() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("daxi_offline_v1", 3);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("bootstrap")) db.createObjectStore("bootstrap");
          if (!db.objectStoreNames.contains("htmx_cache")) db.createObjectStore("htmx_cache");
          if (!db.objectStoreNames.contains("auth")) db.createObjectStore("auth");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }
  async function cachePut(key, payload) {
    const db = await openIdb();
    if (!db) {
      try {
        localStorage.setItem("daxi_cache_" + key, JSON.stringify({ payload, saved_at: Date.now() }));
      } catch (e) {
      }
      return;
    }
    await new Promise((resolve) => {
      try {
        const tx = db.transaction("htmx_cache", "readwrite");
        tx.objectStore("htmx_cache").put({ html: payload, saved_at: Date.now() }, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }
  async function cacheGet(key) {
    const db = await openIdb();
    if (!db) {
      try {
        const raw = localStorage.getItem("daxi_cache_" + key);
        return raw ? JSON.parse(raw).payload : null;
      } catch (e) {
        return null;
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction("htmx_cache", "readonly");
        const req = tx.objectStore("htmx_cache").get(key);
        req.onsuccess = () => resolve(req.result && req.result.html);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }
  function cacheKey(url) {
    return pathOnly(url);
  }
  var nativeOnline = typeof navigator !== "undefined" ? navigator.onLine !== false : true;
  var networkToastsReady = false;
  var offlineGraceTimer = null;
  var OFFLINE_GRACE_MS = 400;
  function waitForOnline(maxMs) {
    const limit = maxMs == null ? 1200 : maxMs;
    if (!nativeOnline && navigator.onLine === false) return Promise.resolve(false);
    if (nativeOnline || navigator.onLine) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => finish(nativeOnline || navigator.onLine), limit);
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("online", onUp);
        resolve(!!ok);
      }
      function onUp() {
        finish(true);
      }
      window.addEventListener("online", onUp);
    });
  }
  window._daxiWaitForOnline = waitForOnline;
  function commitOffline(opts) {
    if (!nativeOnline) return;
    nativeOnline = false;
    window._daxiNativeOnline = false;
    window.dispatchEvent(new Event("offline"));
    try {
      if (window.DaxiOffline) {
        if (DaxiOffline.applyCachedUi) DaxiOffline.applyCachedUi("active");
        if (DaxiOffline.ensureOfflineMap) DaxiOffline.ensureOfflineMap();
      }
    } catch (eOff) {
    }
    try {
      if (window.DaxiNetworkBanner && DaxiNetworkBanner.show) DaxiNetworkBanner.show();
    } catch (eBan) {
    }
  }
  function setOnline(on, opts) {
    const next = !!on;
    if (next) {
      if (offlineGraceTimer) {
        clearTimeout(offlineGraceTimer);
        offlineGraceTimer = null;
      }
      if (nativeOnline) return;
      nativeOnline = true;
      window._daxiNativeOnline = true;
      window.dispatchEvent(new Event("online"));
      if (typeof window._daxiRetryMainMapLoad === "function" && !window._daxiGoogleMapHasBeenShown) {
        window._daxiRetryMainMapLoad();
      } else if (typeof window._daxiLoadGoogleMaps === "function" && !window._clientBgMap) {
        window._daxiLoadGoogleMaps();
      }
      if (typeof window._daxiBootLoadOrders === "function") window._daxiBootLoadOrders();
      if (typeof window._daxiBootPreloadClientOrders === "function") window._daxiBootPreloadClientOrders();
      return;
    }
    if (!nativeOnline) return;
    if (opts && opts.immediate) {
      commitOffline(opts);
      return;
    }
    if (offlineGraceTimer) return;
    offlineGraceTimer = setTimeout(() => {
      offlineGraceTimer = null;
      commitOffline(opts);
    }, OFFLINE_GRACE_MS);
  }
  window._daxiIsNativeOnline = () => nativeOnline;
  window.DaxiNetworkState = {
    isOnline: () => nativeOnline
  };
  async function initNetwork() {
    try {
      const status = await Network2.getStatus();
      const on = !!(status && status.connected);
      setOnline(on, { silent: true });
      Network2.addListener("networkStatusChange", (s) => {
        const pluginOn = !!s.connected;
        const browserOn = navigator.onLine !== false;
        if (!pluginOn && browserOn) {
          setOnline(true, { silent: true });
          return;
        }
        setOnline(pluginOn && browserOn);
      });
    } catch (e) {
      setOnline(navigator.onLine !== false, { silent: true });
      window.addEventListener("online", () => setOnline(true));
      window.addEventListener("offline", () => setOnline(false));
    }
    setTimeout(() => {
      networkToastsReady = true;
    }, 2500);
  }
  function notifyOfflineBlocked(action) {
    try {
      if (document.getElementById("daxi-map-need-online")) return;
      if (document.querySelector("#daxi-offline-required-modal.show")) return;
      if (document.querySelector(".daxi-offline-modal.show")) return;
      if (window.DaxiNetworkState && DaxiNetworkState.notifyAction) {
        DaxiNetworkState.notifyAction(action);
        return;
      }
      if (window._daxiShowOfflineModal) {
        window._daxiShowOfflineModal(action);
        return;
      }
    } catch (e) {
    }
  }
  function blockIfOffline(method, url) {
    if (nativeOnline) return false;
    if (!isWrite(method, url)) return false;
    return true;
  }
  function rememberApiError(kind, url, extra) {
    const rec = { kind, url: pathOnly(url), at: Date.now(), extra: extra || null };
    if (window.DaxiApi) window.DaxiApi.lastError = rec;
    apiLog(kind === "TIMEOUT" ? "Timeout" : kind === "NETWORK_ERROR" ? "Network error" : "Response: " + kind, rec.url);
    return rec;
  }
  function patchWebSocket() {
    const Orig = window.WebSocket;
    if (!Orig || Orig.__daxiPatched) return;
    function DaxiWebSocket(url, protocols) {
      const next = backendWsUrl(url);
      apiLog("WS " + next);
      return protocols !== void 0 ? new Orig(next, protocols) : new Orig(next);
    }
    DaxiWebSocket.prototype = Orig.prototype;
    DaxiWebSocket.__daxiPatched = true;
    window.WebSocket = DaxiWebSocket;
  }
  function captureCsrfFromBody(text) {
    if (!text || text.charAt(0) !== "{") return;
    try {
      rememberCsrfFromPayload(JSON.parse(text));
    } catch (e) {
    }
  }
  function wrapGetCsrfToken() {
    const prev = window.getCsrfToken;
    if (prev && prev.__daxiWrapped) return;
    window.getCsrfToken = function() {
      return getStoredCsrf() || (typeof prev === "function" ? prev() : "");
    };
    window.getCsrfToken.__daxiWrapped = true;
  }
  function enableHtmxCredentials() {
    if (window.htmx && window.htmx.config) window.htmx.config.withCredentials = true;
  }
  function maybePatchJsonFetchResponse(res, text, url, method) {
    if (!res || !res.ok || method !== "GET") return res;
    const ct = res.headers && res.headers.get("content-type") || "";
    if (ct.indexOf("json") < 0) return res;
    try {
      const data = JSON.parse(text);
      const patched = rewriteJsonMediaDeep(data);
      if (url.indexOf("/api/mobile/bootstrap/") >= 0 && window.DaxiSessionStore) {
        rememberCsrfFromPayload(data);
        window.DaxiSessionStore.saveFromBootstrap(data, true);
      }
      const headers = new Headers(res.headers);
      return new Response(JSON.stringify(patched), {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    } catch (e) {
      return res;
    }
  }
  function patchNetworking() {
    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function(input, init) {
        init = init || {};
        let url = typeof input === "string" ? input : input && input.url;
        url = backendUrl(url);
        const method = (init.method || input && input.method || "GET").toUpperCase();
        const backend = isDaxiBackend(url);
        if (backend && !nativeOnline) {
          if (blockIfOffline(method, url)) {
            rememberApiError("NETWORK_ERROR", url, { reason: "offline" });
            return Promise.reject(new Error("offline_write_blocked"));
          }
          if (method === "GET") {
            return cacheGet(cacheKey(url)).then((cached) => {
              if (cached != null) {
                const ct = /\/api\//i.test(url) ? "application/json; charset=utf-8" : "text/html; charset=utf-8";
                return new Response(cached, {
                  status: 200,
                  headers: { "Content-Type": ct }
                });
              }
              rememberApiError("NETWORK_ERROR", url, { reason: "offline" });
              return Promise.reject(new Error("offline"));
            });
          }
        }
        if (typeof input === "string") input = url;
        else if (input && input.url) input = new Request(url, input);
        if (backend) {
          const headers = new Headers(init.headers || {});
          headers.set("ngrok-skip-browser-warning", "true");
          headers.set("X-Daxi-Hybrid", "1");
          headers.set("X-Daxi-Native", "1");
          attachCsrfHeader(headers, method);
          init.headers = headers;
          init.credentials = "include";
          apiLog(method + " " + pathOnly(url));
          if (!init.signal && typeof AbortController !== "undefined") {
            const ctrl = new AbortController();
            init.signal = ctrl.signal;
            const t = setTimeout(() => ctrl.abort(), BACKEND_FETCH_TIMEOUT_MS);
            const clear = () => clearTimeout(t);
            return origFetch(input, init).then(async (res) => {
              clear();
              rememberCsrfFromResponse(res);
              const kind = classifyHttpStatus(res.status);
              if (!res.ok) rememberApiError(kind, url, { status: res.status });
              else apiLog("Response: " + res.status);
              if (res.ok && method === "GET" && backend) {
                try {
                  const clone = res.clone();
                  const text = await clone.text();
                  captureCsrfFromBody(text);
                  if (API_RE.test(url)) cachePut(cacheKey(url), text);
                  return maybePatchJsonFetchResponse(res, text, url, method);
                } catch (e) {
                }
              } else {
                try {
                  const ct = res.headers.get("content-type") || "";
                  if (ct.indexOf("json") >= 0) {
                    const clone = res.clone();
                    captureCsrfFromBody(await clone.text());
                  }
                } catch (e2) {
                }
              }
              return res;
            }).catch(async (err) => {
              clear();
              if (method === "GET" && nativeOnline) {
                const back = await waitForOnline(1200);
                if (back) {
                  try {
                    const retryRes = await origFetch(input, init);
                    rememberCsrfFromResponse(retryRes);
                    return retryRes;
                  } catch (eRetry) {
                  }
                }
                try {
                  const cached = await cacheGet(cacheKey(url));
                  if (cached != null) {
                    const ct = /\/api\//i.test(url) ? "application/json; charset=utf-8" : "text/html; charset=utf-8";
                    return new Response(cached, {
                      status: 200,
                      headers: { "Content-Type": ct }
                    });
                  }
                } catch (e3) {
                }
              }
              rememberApiError(classifyFetchError(err), url);
              throw err;
            });
          }
        }
        return origFetch(input, init).then(async (res) => {
          if (backend) rememberCsrfFromResponse(res);
          if (backend && res.ok && method === "GET") {
            try {
              const clone = res.clone();
              const text = await clone.text();
              captureCsrfFromBody(text);
              if (API_RE.test(url)) cachePut(cacheKey(url), text);
              return maybePatchJsonFetchResponse(res, text, url, method);
            } catch (e) {
            }
          }
          return res;
        });
      };
    }
    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._daxiMethod = (method || "GET").toUpperCase();
      this._daxiUrl = backendUrl(url);
      this._daxiBackend = isDaxiBackend(this._daxiUrl);
      const ret = XO.call(this, method, this._daxiUrl);
      if (this._daxiBackend) this.withCredentials = true;
      return ret;
    };
    XMLHttpRequest.prototype.send = function(body) {
      if (this._daxiBackend && blockIfOffline(this._daxiMethod, this._daxiUrl)) {
        rememberApiError("NETWORK_ERROR", this._daxiUrl, { reason: "offline" });
        this.dispatchEvent(new Event("error"));
        return;
      }
      if (this._daxiBackend) {
        try {
          this.setRequestHeader("ngrok-skip-browser-warning", "true");
          this.setRequestHeader("X-Daxi-Hybrid", "1");
          this.setRequestHeader("X-Daxi-Native", "1");
          const csrf = getStoredCsrf();
          if (csrf && this._daxiMethod !== "GET" && this._daxiMethod !== "HEAD") {
            this.setRequestHeader("X-CSRFToken", csrf);
          }
        } catch (e) {
        }
        try {
          this.timeout = this.timeout || BACKEND_FETCH_TIMEOUT_MS;
        } catch (e2) {
        }
        apiLog(this._daxiMethod + " " + pathOnly(this._daxiUrl));
      }
      const xhr = this;
      xhr.addEventListener("load", function() {
        if (!xhr._daxiBackend) return;
        try {
          const h = xhr.getResponseHeader("X-CSRFToken");
          if (h) rememberCsrfToken(h);
        } catch (e) {
        }
        captureCsrfFromBody(xhr.responseText || "");
        if (xhr.status >= 400) rememberApiError(classifyHttpStatus(xhr.status), xhr._daxiUrl, { status: xhr.status });
        else apiLog("Response: " + xhr.status);
        if (xhr._daxiMethod === "GET" && xhr.status >= 200 && xhr.status < 300 && API_RE.test(xhr._daxiUrl || "")) {
          cachePut(cacheKey(xhr._daxiUrl), xhr.responseText || "");
        }
      });
      xhr.addEventListener("timeout", function() {
        if (xhr._daxiBackend) rememberApiError("TIMEOUT", xhr._daxiUrl);
      });
      xhr.addEventListener("error", function() {
        if (xhr._daxiBackend) rememberApiError("NETWORK_ERROR", xhr._daxiUrl);
      });
      return XS.call(this, body);
    };
    patchWebSocket();
    enableHtmxCredentials();
    document.addEventListener("htmx:load", enableHtmxCredentials);
    installMediaRewriter();
    document.addEventListener("htmx:configRequest", (evt) => {
      if (!evt.detail) return;
      const path = evt.detail.path || "";
      if (isDaxiBackend(path)) {
        evt.detail.path = backendUrl(path);
        evt.detail.headers = evt.detail.headers || {};
        evt.detail.headers["ngrok-skip-browser-warning"] = "true";
        evt.detail.headers["X-Daxi-Hybrid"] = "1";
        evt.detail.headers["X-Daxi-Native"] = "1";
        evt.detail.credentials = "include";
        const csrf = getStoredCsrf();
        const verb = (evt.detail.verb || "GET").toUpperCase();
        if (csrf && verb !== "GET" && verb !== "HEAD") {
          evt.detail.headers["X-CSRFToken"] = csrf;
        }
        apiLog(verb + " " + pathOnly(evt.detail.path || ""));
      }
    });
    document.addEventListener(
      "htmx:beforeRequest",
      (evt) => {
        const d = evt.detail || {};
        const method = (d.verb || d.requestConfig?.verb || "GET").toUpperCase();
        const path = d.path || d.pathInfo?.requestPath || "";
        if (d.xhr) d.xhr.withCredentials = true;
        if (blockIfOffline(method, path)) {
          evt.preventDefault();
          try {
            const el = d.elt;
            if (el) {
              el.disabled = false;
              el.style.opacity = "";
              el.classList.remove("daxi-btn-busy", "daxi-btn-loading");
              el.removeAttribute("aria-busy");
              if (el.dataset && el.dataset.origHtml) el.innerHTML = el.dataset.origHtml;
            }
          } catch (e) {
          }
          notifyOfflineBlocked("Action");
        }
      },
      true
    );
    document.addEventListener(
      "submit",
      (evt) => {
        const form = evt.target;
        if (!form || !form.tagName || form.tagName !== "FORM") return;
        const hxAction = form.getAttribute("hx-post") || form.getAttribute("hx-put") || form.getAttribute("hx-patch") || form.getAttribute("hx-delete") || "";
        if (!hxAction) return;
        const method = form.getAttribute("hx-delete") ? "DELETE" : form.getAttribute("hx-patch") ? "PATCH" : form.getAttribute("hx-put") ? "PUT" : "POST";
        if (blockIfOffline(method, hxAction)) {
          evt.preventDefault();
          evt.stopPropagation();
          notifyOfflineBlocked("Action");
        }
      },
      true
    );
    document.addEventListener(
      "click",
      (evt) => {
        const el = evt.target && evt.target.closest ? evt.target.closest("[hx-post],[hx-put],[hx-patch],[hx-delete]") : null;
        if (!el) return;
        const method = el.getAttribute("hx-delete") ? "DELETE" : el.getAttribute("hx-patch") ? "PATCH" : el.getAttribute("hx-put") ? "PUT" : "POST";
        const url = el.getAttribute("hx-post") || el.getAttribute("hx-put") || el.getAttribute("hx-patch") || el.getAttribute("hx-delete") || "";
        if (!url) return;
        if (blockIfOffline(method, url)) {
          evt.preventDefault();
          evt.stopPropagation();
          notifyOfflineBlocked("Action");
        }
      },
      true
    );
    document.addEventListener(
      "click",
      (evt) => {
        const a = evt.target && evt.target.closest ? evt.target.closest("a[href]") : null;
        if (!a) return;
        if (a.hasAttribute("download")) return;
        if (String(a.getAttribute("target") || "") === "_blank") return;
        if (a.getAttribute("hx-get") || a.getAttribute("hx-post") || a.getAttribute("hx-put") || a.getAttribute("hx-patch") || a.getAttribute("hx-delete")) return;
        const href = a.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#") return;
        if (/^(mailto:|tel:|sms:|javascript:|whatsapp:|daxi:)/i.test(href)) return;
        let dest;
        try {
          dest = new URL(href, window.location.href);
        } catch (e) {
          return;
        }
        if (dest.protocol !== "http:" && dest.protocol !== "https:") return;
        const host = dest.hostname;
        const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
        if (!local && dest.origin === window.location.origin) {
          if (!nativeOnline && dest.pathname !== (location.pathname || "/")) {
            evt.preventDefault();
            evt.stopPropagation();
            if (dest.pathname.indexOf("/compte") === 0) location.hash = "#/compte";
            else if (dest.pathname.indexOf("/assistance") === 0) location.hash = "#/assistance";
            else notifyOfflineBlocked("Cette page");
          }
          return;
        }
        const sameDaxiHost = /daxipro\.com$/i.test(host) && /daxipro\.com$/i.test(window.location.hostname || "");
        if (sameDaxiHost && (dest.pathname.indexOf("/driver") === 0 || dest.pathname.indexOf("/entreprise") === 0 || dest.pathname.indexOf("/admin-dashboard") === 0)) {
          const localNext = dest.pathname + dest.search + dest.hash;
          if (localNext !== location.pathname + location.search + location.hash) {
            evt.preventDefault();
            evt.stopPropagation();
            window.location.assign(localNext);
          }
          return;
        }
        if (!local && !/ngrok|daxipro\.com$/i.test(host) && dest.origin !== window.location.origin) return;
        if (!nativeOnline) {
          evt.preventDefault();
          evt.stopPropagation();
          notifyOfflineBlocked("Cette page");
          return;
        }
        const next = nativePageUrl(dest.pathname + dest.search + dest.hash);
        if (!next || next === href || next === dest.href) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (/\/entreprise(\/|\?|#|$)/i.test(dest.pathname)) {
          try {
            sessionStorage.setItem("daxi_from_app", "1");
          } catch (eEnt) {
          }
        }
        window.location.assign(next);
      },
      true
    );
  }
  var gpsWatchId = null;
  async function readNativeGps() {
    if (!window._daxiGpsPerm) {
      throw new Error("permission");
    }
    const last = window._daxiLastNativeGps;
    if (last && last.ts && Date.now() - last.ts < 8e3) return last;
    const pos = await Geolocation2.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 12e3,
      maximumAge: 5e3
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      ts: Date.now()
    };
  }
  function startGpsWatch() {
    if (gpsWatchId != null) return;
    Geolocation2.watchPosition({ enableHighAccuracy: true, timeout: 3e4 }, (pos, err) => {
      if (err || !pos || !pos.coords) return;
      window._daxiLastNativeGps = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        ts: Date.now()
      };
      try {
        if (typeof window._daxiOnNativeGpsFix === "function") {
          window._daxiOnNativeGpsFix(window._daxiLastNativeGps);
        }
      } catch (eFix) {
      }
    }).then((id) => {
      gpsWatchId = id;
    }).catch(() => {
    });
  }
  function pushLog(msg, extra) {
    try {
      const debug = !!(window.DAXI_API_DEBUG_LOGS || window.DAXI_PUSH_DEBUG);
      if (extra && extra.token && !debug) {
        extra = Object.assign({}, extra, { token: String(extra.token).slice(0, 8) + "\u2026" });
      }
      const line = extra ? msg + " " + JSON.stringify(extra) : msg;
      console.log("[DAXI PUSH] " + line);
    } catch (e) {
    }
  }
  function toHttpsDaxiUrl(raw) {
    let s = String(raw || "").trim();
    if (!s) return "";
    try {
      if (/^daxi:/i.test(s)) s = s.replace(/^daxi:\/\//i, "https://daxipro.com/");
      const u = new URL(s, "https://daxipro.com");
      const host = String(u.hostname || "").replace(/^www\./i, "").toLowerCase();
      if (host && host !== "daxipro.com") return "";
      return u.origin + u.pathname + u.search + u.hash;
    } catch (e) {
      return "";
    }
  }
  function isOffHomeDeepLink(raw) {
    if (window.DaxiDeepLinkRouter && typeof window.DaxiDeepLinkRouter.isOffHome === "function") {
      return window.DaxiDeepLinkRouter.isOffHome(raw);
    }
    const dest = toHttpsDaxiUrl(raw);
    if (!dest) return false;
    try {
      const u = new URL(dest);
      const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
      return path !== "/";
    } catch (e2) {
      return false;
    }
  }
  function installDaxiDeepLink() {
    if (window.DaxiDeepLink && window.DaxiDeepLink._daxiNative) return window.DaxiDeepLink;
    const api = {
      _daxiNative: true,
      _pending: null,
      handle(raw) {
        const url = String(raw || "").trim();
        if (!url) return;
        pushLog("Deep link received", { url: url.slice(0, 180) });
        this._pending = url;
        try {
          sessionStorage.setItem("daxi_pending_deeplink", url);
        } catch (e) {
        }
        Preferences.set({ key: "daxi_pending_deeplink", value: url }).catch(() => {
        });
        if (this.execute(url)) this.clear();
      },
      ready() {
        const queued = this._pending || (function() {
          try {
            return sessionStorage.getItem("daxi_pending_deeplink") || "";
          } catch (e) {
            return "";
          }
        })();
        if (!queued) {
          Preferences.get({ key: "daxi_pending_deeplink" }).then((r) => {
            if (r && r.value) api.handle(r.value);
          }).catch(() => {
          });
          return;
        }
        if (this.execute(queued)) this.clear();
      },
      clear() {
        this._pending = null;
        try {
          sessionStorage.removeItem("daxi_pending_deeplink");
        } catch (e) {
        }
        Preferences.remove({ key: "daxi_pending_deeplink" }).catch(() => {
        });
      },
      execute(raw) {
        const url = String(raw || "").trim();
        if (!url) return true;
        if (window.DaxiDeepLinkRouter) {
          const parsed = window.DaxiDeepLinkRouter.parse(url);
          pushLog("Deep link executed", { type: parsed && parsed.type, path: parsed && parsed.path });
          window.DaxiDeepLinkRouter.apply(parsed);
          return true;
        }
        const dest = toHttpsDaxiUrl(url);
        if (!dest) return false;
        try {
          const here = location.origin + location.pathname + location.search + location.hash;
          if (here !== dest) location.assign(dest);
          return true;
        } catch (e) {
          return false;
        }
      }
    };
    window.DaxiDeepLink = api;
    return api;
  }
  async function getStableDeviceId() {
    try {
      const pref = await Preferences.get({ key: "daxi_device_id" });
      if (pref && pref.value) return pref.value;
    } catch (e) {
    }
    let id = "";
    try {
      id = localStorage.getItem("daxi_device_id") || "";
    } catch (e2) {
    }
    if (!id) {
      id = "daxi-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }
    try {
      localStorage.setItem("daxi_device_id", id);
    } catch (e3) {
    }
    Preferences.set({ key: "daxi_device_id", value: id }).catch(() => {
    });
    return id;
  }
  async function postPushToken(token) {
    if (!token) return;
    const deviceId = await getStableDeviceId();
    const body = {
      token,
      guest_id: window._daxiGuestId || localStorage.getItem("daxi_guest_id") || "",
      platform: Capacitor.getPlatform(),
      device_id: deviceId
    };
    const headers = { "Content-Type": "application/json", "X-Daxi-Native": "1" };
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1];
    if (csrf) headers["X-CSRFToken"] = decodeURIComponent(csrf);
    try {
      const resp = await fetch(absUrl("/api/notifications/register-device/"), {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(body)
      });
      if (resp.ok) pushLog("Token registered");
      else pushLog("Token registered", { status: resp.status });
    } catch (e) {
      pushLog("Token registered", { error: "network" });
    }
  }
  window._daxiRegisterPushToken = function() {
    if (window._daxiFcmToken) postPushToken(window._daxiFcmToken);
  };
  async function ensurePushChannels() {
    if (Capacitor.getPlatform() !== "android") return;
    const channels = [
      { id: "daxi_orders", name: "Courses DAXI", description: "Suivi de vos courses", importance: 4, sound: "default", vibration: true, visibility: 1 },
      { id: "daxi_urgent", name: "Alertes DAXI", description: "Alertes importantes", importance: 5, sound: "default", vibration: true, visibility: 1 },
      { id: "daxi_sos", name: "SOS DAXI", description: "Alertes d\u2019urgence", importance: 5, sound: "default", vibration: true, visibility: 1 }
    ];
    for (const ch of channels) {
      try {
        await PushNotifications.createChannel(ch);
      } catch (e) {
      }
    }
  }
  function registerPushIfGranted() {
    ensurePushChannels().finally(() => {
      PushNotifications.register().catch(() => {
      });
    });
  }
  async function initPush() {
    if (!Capacitor.isNativePlatform()) return;
    if (window._daxiPushBound) return;
    window._daxiPushBound = true;
    installDaxiDeepLink();
    try {
      await ensurePushChannels();
      const permNow = await PushNotifications.checkPermissions();
      pushLog("Permission status", { receive: permNow && permNow.receive });
      PushNotifications.addListener("registration", (token) => {
        let value = token && token.value || "";
        if (Capacitor.getPlatform() === "ios") {
          if (window._daxiFcmTokenNative) {
            value = window._daxiFcmTokenNative;
          } else if (value && value.indexOf(":") === -1) {
            window._daxiApnsHexPending = value;
            pushLog("iOS APNs ok \u2014 attente token FCM natif");
            return;
          }
        }
        window._daxiFcmToken = value;
        pushLog("FCM/APNs registration success");
        postPushToken(window._daxiFcmToken);
      });
      window.addEventListener("daxi-fcm-token", (ev) => {
        try {
          const t = ev && ev.detail && ev.detail.token || window._daxiFcmTokenNative || "";
          if (!t) return;
          window._daxiFcmToken = t;
          window._daxiFcmTokenNative = t;
          pushLog("FCM token iOS inject\xE9");
          postPushToken(t);
        } catch (e) {
        }
      });
      PushNotifications.addListener("registrationError", (err) => {
        pushLog("FCM/APNs registration error", { error: err && err.error ? String(err.error).slice(0, 80) : "unknown" });
        apiLog("push registration error " + (err && err.error ? err.error : ""));
      });
      PushNotifications.addListener("pushNotificationReceived", (notif) => {
        pushLog("Notification received", { title: notif && notif.title });
        haptic(ImpactStyle.Medium);
        try {
          const data = notif && notif.data || {};
          if (data.order_id && typeof window._daxiFocusClientOrder === "function" && document.visibilityState === "visible") {
          }
        } catch (e) {
        }
      });
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        pushLog("Notification action");
        const data = action && action.notification && action.notification.data || {};
        const oid = data.order_id || "";
        const target = data.deep_link || data.url || data.link || (oid ? "/#courses/" + oid : "");
        if (target) handleDeepLink(target);
        else if (oid && typeof window._daxiFocusClientOrder === "function") {
          window._daxiFocusClientOrder(oid);
        }
      });
      const perm = permNow;
      if (perm.receive === "granted") {
        window._daxiNativePushGranted = true;
        try {
          localStorage.setItem("daxi_notif_asked", "1");
        } catch (eLs) {
        }
        try {
          await Preferences.set({ key: "daxi_notif_asked", value: "1" });
        } catch (ePref) {
        }
        registerPushIfGranted();
      } else {
        try {
          const pref = await Preferences.get({ key: "daxi_notif_asked" });
          if (pref && pref.value === "1") {
            try {
              localStorage.setItem("daxi_notif_asked", "1");
            } catch (eLs2) {
            }
          }
        } catch (ePref2) {
        }
      }
    } catch (e) {
    }
  }
  function installNativeBridge() {
    window._daxiUseNativeGps = true;
    window.DaxiAndroid = Object.assign(window.DaxiAndroid || {}, {
      getPlatform: () => Capacitor.getPlatform(),
      isOnline: () => nativeOnline,
      getLiveBaseUrl: () => getApiBase(),
      isLocationEnabled: () => !!window._daxiGpsPerm,
      getCurrentLocation: () => {
        try {
          if (!window._daxiGpsPerm) return JSON.stringify({ error: "permission" });
          const last = window._daxiLastNativeGps;
          return last && last.lat != null ? JSON.stringify(last) : JSON.stringify({ error: "pending" });
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      },
      refreshLocation: () => {
        if (!window._daxiGpsPerm) return;
        if (gpsWatchId != null) return;
        readNativeGps().then((p) => {
          window._daxiLastNativeGps = p;
        }).catch(() => {
        });
      },
      getFcmToken: () => window._daxiFcmToken || "",
      notifyMapReady: () => {
      },
      requestLocationPermission: () => {
        Geolocation2.requestPermissions().then(async (perm) => {
          const ok = perm.location === "granted" || perm.coarseLocation === "granted";
          window._daxiGpsPerm = ok;
          if (!ok) {
            if (window._daxiOnNativeLocationDenied) window._daxiOnNativeLocationDenied();
            return;
          }
          startGpsWatch();
          if (window._daxiOnNativeLocationGranted) {
            window._daxiOnNativeLocationGranted(void 0, void 0, void 0);
          }
          readNativeGps().then((p) => {
            window._daxiLastNativeGps = p;
            if (window._daxiOnNativeGpsFix) window._daxiOnNativeGpsFix(p);
          }).catch(() => {
          });
        }).catch(() => {
          if (window._daxiOnNativeLocationDenied) window._daxiOnNativeLocationDenied();
        });
      },
      requestNotificationPermission: () => {
        const deny = () => {
          if (window._daxiOnNativeNotifPermissionDenied) window._daxiOnNativeNotifPermissionDenied();
        };
        const webFallback = () => {
          const web = window._daxiRequestWebPushPermission;
          if (typeof web !== "function") {
            deny();
            return;
          }
          web().then((r) => {
            if (r && r.ok) {
              if (window._daxiOnNativeNotifPermissionGranted) window._daxiOnNativeNotifPermissionGranted();
            } else {
              deny();
            }
          }).catch(deny);
        };
        try {
          if (!PushNotifications || typeof PushNotifications.requestPermissions !== "function") {
            webFallback();
            return;
          }
          PushNotifications.requestPermissions().then(async (perm) => {
            if (perm.receive !== "granted") {
              deny();
              return;
            }
            try {
              await PushNotifications.register();
              pushLog("FCM/APNs registration success");
            } catch (e) {
            }
            if (window._daxiOnNativeNotifPermissionGranted) window._daxiOnNativeNotifPermissionGranted();
          }).catch(webFallback);
        } catch (e) {
          webFallback();
        }
      }
    });
  }
  async function initGps() {
    try {
      const perm = await Geolocation2.checkPermissions();
      const granted = perm.location === "granted" || perm.coarseLocation === "granted";
      window._daxiGpsPerm = granted;
      if (!granted) return;
      startGpsWatch();
      if (window._daxiOnNativeLocationGranted) {
        window._daxiOnNativeLocationGranted(void 0, void 0, void 0);
      }
      readNativeGps().then((p) => {
        window._daxiLastNativeGps = p;
        if (window._daxiOnNativeGpsFix) window._daxiOnNativeGpsFix(p);
      }).catch(() => {
      });
    } catch (e) {
      window._daxiGpsPerm = false;
    }
  }
  async function restoreOfflineReads() {
    if (nativeOnline) return;
    const cached = await cacheGet("/api/mobile/bootstrap/");
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (window.DaxiSessionStore) window.DaxiSessionStore.saveFromBootstrap(data, false);
        if (window.DaxiOffline && DaxiOffline.applyBootstrap) DaxiOffline.applyBootstrap(data);
        window._daxiOfflineData = data;
      } catch (e) {
      }
    }
  }
  async function restoreShellRoleAndRedirect(launchUrl) {
    if (launchUrl && isOffHomeDeepLink(launchUrl)) return false;
    try {
      if (sessionStorage.getItem("daxi_shell_nav") === "1") return false;
    } catch (eNav) {
    }
    let role = "";
    try {
      role = localStorage.getItem("daxi_native_shell") || localStorage.getItem("daxi_app_shell") || "";
    } catch (e) {
    }
    try {
      const pref = await Preferences.get({ key: "daxi_native_shell" });
      if (pref && pref.value) role = pref.value;
    } catch (e2) {
    }
    if (role !== "driver" && role !== "admin" && role !== "enterprise") return false;
    try {
      localStorage.setItem("daxi_native_shell", role);
      localStorage.setItem("daxi_app_shell", role);
    } catch (e3) {
    }
    const path = String(location.pathname || "").toLowerCase();
    if (role === "driver") {
      if (path.indexOf("/driver") >= 0) return false;
      location.replace("/driver/");
      return true;
    }
    if (role === "admin") {
      if (path.indexOf("/admin") >= 0) return false;
      location.replace("/admin-dashboard/");
      return true;
    }
    if (path.indexOf("/entreprise/dashboard") >= 0) return false;
    location.replace("/entreprise/dashboard/");
    return true;
  }
  function markNative() {
    document.documentElement.classList.add("daxi-native-shell");
    window._daxiIsNativeApp = () => true;
    window._daxiCapacitorApp = true;
    window._daxiHybridShell = true;
  }
  function rewriteMediaUrl(val) {
    let s = String(val || "").trim();
    if (!s || /^(blob:|data:|capacitor:)/i.test(s)) return s;
    if (s.indexOf("//") === 0) s = "https:" + s;
    const base = getApiBase();
    try {
      if (/^https?:\/\//i.test(s)) {
        const u = new URL(s);
        if (u.protocol === "http:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
          u.protocol = "https:";
          s = u.toString();
        }
        if (/cloudinary\.com$/i.test(u.hostname) || /\.cloudinary\.com$/i.test(u.hostname)) {
          return s.replace(/^http:\/\//i, "https://");
        }
        if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
          return (base || window.location.origin) + u.pathname + u.search;
        }
        const apiHost = base ? new URL(base).hostname : "";
        if (apiHost && u.hostname === apiHost && u.pathname) {
          return u.toString();
        }
        return s;
      }
      const origin = base || (typeof location !== "undefined" ? location.origin : "");
      if (!origin) return s;
      if (s.startsWith("/")) return origin + s;
      if (/^(media|static|assets|uploads|villes)\//i.test(s)) return origin + "/" + s;
    } catch (e) {
    }
    return s;
  }
  function isRemoteMediaUrl(url) {
    const s = String(url || "");
    if (!s || /^(blob:|data:)/i.test(s)) return false;
    if (/cloudinary\.com/i.test(s)) return true;
    const base = getApiBase();
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        const apiHost = base ? new URL(base).hostname : "";
        if (apiHost && u.hostname === apiHost) {
          return /\/(media|assets|villes)\//i.test(u.pathname);
        }
        return true;
      } catch (e) {
        return true;
      }
    }
    return /^(media|assets|villes)\//i.test(s) || /^\/(media|assets|villes)\//i.test(s);
  }
  function rewriteJsonMediaDeep(value) {
    if (value == null) return value;
    if (typeof value === "string") {
      const t = value.trim();
      if (/^(media|static|assets|uploads|villes)\//i.test(t) || /^\/(media|static|assets|uploads|villes)\//i.test(t) || /^https?:\/\//i.test(t) && /\/(media|assets|villes)\//i.test(t)) {
        return rewriteMediaUrl(t);
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(rewriteJsonMediaDeep);
    if (typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((k) => {
        out[k] = rewriteJsonMediaDeep(value[k]);
      });
      return out;
    }
    return value;
  }
  function rewriteStyleUrls(el) {
    if (!el || !el.style) return;
    ["backgroundImage", "background"].forEach((prop) => {
      const v = el.style[prop];
      if (!v || v.indexOf("url(") < 0) return;
      el.style[prop] = v.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, q, u) => {
        const next = rewriteMediaUrl(u.trim());
        if (next === u.trim()) return full;
        return "url(" + q + next + q + ")";
      });
    });
  }
  function rewriteMediaIn(root) {
    if (!root) return;
    const scope = root.querySelectorAll ? root : null;
    const nodes = [];
    if (root.tagName === "IMG" || root.tagName === "SOURCE" || root.tagName === "VIDEO" || root.tagName === "AUDIO") {
      nodes.push(root);
    }
    if (scope) {
      scope.querySelectorAll('img, source, video, audio, [style*="url("]').forEach((el) => nodes.push(el));
    }
    nodes.forEach((el) => {
      ["src", "poster", "srcset"].forEach((attr) => {
        const v = el.getAttribute && el.getAttribute(attr);
        if (!v) return;
        if (attr === "srcset") {
          const next2 = v.split(",").map((part) => {
            const bits = part.trim().split(/\s+/);
            if (!bits[0]) return part;
            bits[0] = rewriteMediaUrl(bits[0]);
            return bits.join(" ");
          }).join(", ");
          if (next2 !== v) el.setAttribute(attr, next2);
          return;
        }
        const next = rewriteMediaUrl(v);
        if (next !== v) el.setAttribute(attr, next);
      });
      if (el.tagName === "IMG") {
        const src = el.getAttribute("src") || "";
        if (isRemoteMediaUrl(src)) {
          if (!el.getAttribute("loading")) el.setAttribute("loading", "lazy");
          el.setAttribute("decoding", "async");
        } else if (!el.getAttribute("loading")) {
          el.setAttribute("loading", "eager");
        }
      }
      rewriteStyleUrls(el);
    });
    if (root.getAttribute && root.getAttribute("style") && root.getAttribute("style").indexOf("url(") >= 0) {
      rewriteStyleUrls(root);
    }
  }
  function installMediaRewriter() {
    const run = () => rewriteMediaIn(document);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
    document.addEventListener("htmx:afterSwap", (evt) => {
      rewriteMediaIn(evt.detail && evt.detail.target || document);
    });
    document.addEventListener(
      "error",
      (evt) => {
        const el = evt.target;
        if (!el || el.tagName !== "IMG") return;
        const tries = Number(el.dataset.daxiImgRetry || 0);
        if (tries >= 3) return;
        el.dataset.daxiImgRetry = String(tries + 1);
        const raw = el.getAttribute("src") || "";
        let next = rewriteMediaUrl(raw);
        if (/\.png(\?|$)/i.test(next) && /\/payments\//i.test(next)) {
          next = next.replace(/\.png(\?|$)/i, ".svg$1");
        }
        el.removeAttribute("crossorigin");
        waitForOnline(1200).then(() => {
          if (next && next !== raw) el.setAttribute("src", next);
          else if (raw) el.setAttribute("src", raw.split("#")[0] + (raw.indexOf("?") >= 0 ? "&" : "?") + "_daxi_r=" + Date.now());
        });
      },
      true
    );
    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          rewriteMediaIn(n);
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  async function haptic(style) {
    try {
      await Haptics.impact({ style: style || ImpactStyle.Light });
    } catch (e) {
    }
  }
  async function nativeShare(opts) {
    const title = opts.title || "Daxi";
    const text = opts.text || "";
    const url = opts.url || "";
    try {
      await haptic(ImpactStyle.Medium);
      await Share.share({ title, text, url, dialogTitle: title });
      return true;
    } catch (e) {
      if (url) {
        try {
          await Clipboard.write({ string: url });
          toast("Lien copi\xE9");
        } catch (e2) {
        }
      }
      return false;
    }
  }
  async function shareMyLocation() {
    const gps = window._daxiLastNativeGps;
    if (!gps || !gps.lat) {
      toast("Position indisponible. Activez la localisation.");
      return;
    }
    const maps = "https://maps.google.com/?q=" + gps.lat + "," + gps.lng;
    await nativeShare({
      title: "Ma position Daxi",
      text: "Voici ma position pour la prise en charge.",
      url: maps
    });
  }
  function hookShareUi() {
    const origShare = window.sharePlanLink;
    window.sharePlanLink = function(slug) {
      const url = liveBase() + "/#/tarif/" + slug;
      nativeShare({ title: "Forfait Daxi", text: "D\xE9couvre ce forfait Daxi", url });
      if (typeof origShare === "function" && !Capacitor.isNativePlatform()) origShare(slug);
    };
    if (navigator.share) {
      const webShare = navigator.share.bind(navigator);
      navigator.share = function(data) {
        if (Capacitor.isNativePlatform()) {
          return nativeShare({
            title: data.title || "Daxi",
            text: data.text || "",
            url: data.url || ""
          });
        }
        return webShare(data);
      };
    }
    document.addEventListener(
      "click",
      (evt) => {
        const btn = evt.target && evt.target.closest ? evt.target.closest("#enableLocationBtn, [data-daxi-share-location], .location-share-actions button") : null;
        if (!btn) return;
        const label = (btn.textContent || "").toLowerCase();
        if (label.indexOf("position") >= 0 || btn.id === "enableLocationBtn") {
          haptic(ImpactStyle.Light);
        }
      },
      true
    );
  }
  function handleDeepLink(url) {
    if (!url) return;
    const raw = String(url);
    installDaxiDeepLink();
    window.dispatchEvent(new CustomEvent("daxi:deeplink", { detail: { url: raw } }));
    window.DaxiDeepLink.handle(raw);
  }
  async function initDeepLinks() {
    try {
      App.addListener("appUrlOpen", (event) => handleDeepLink(event.url));
      App.addListener("backButton", () => {
        if (typeof window.daxiHandleSystemBack === "function" && window.daxiHandleSystemBack()) return;
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        App.minimizeApp();
      });
      const launch = await App.getLaunchUrl();
      if (launch && launch.url) handleDeepLink(launch.url);
    } catch (e) {
    }
  }
  async function initChrome() {
    const apply = async () => {
      const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      try {
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        await StatusBar.setBackgroundColor({ color: dark ? "#070B14" : "#F8FAFC" });
      } catch (e) {
      }
    };
    await apply();
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", apply);
      else if (mq.addListener) mq.addListener(apply);
    } catch (e2) {
    }
  }
  function mapLog(msg, extra) {
    if (window.DAXI_API_DEBUG_LOGS === false) return;
    if (extra !== void 0) console.info("[DAXI MAP]", msg, extra);
    else console.info("[DAXI MAP]", msg);
  }
  function initNativeMap() {
    window.DAXI_USE_GOOGLE_MAPS = true;
    window.DAXI_USE_MAPLIBRE = false;
    window._DAXI_USE_MAPLIBRE = false;
    const start = () => {
      if (!nativeOnline && navigator.onLine === false) {
        mapLog("Maps deferred \u2014 offline");
        try {
          if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
            DaxiOffline.initSimpleMap("daxi-main-map", { force: true });
          }
          window._daxiBootState = window._daxiBootState || {};
          window._daxiBootState.mapReady = true;
          if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
        } catch (e) {
        }
        return;
      }
      mapLog("Starting Google Maps");
      if (typeof window._daxiLoadGoogleMaps === "function") window._daxiLoadGoogleMaps();
    };
    const later = () => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(start, { timeout: 1200 });
      else setTimeout(start, 400);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", later);
    else later();
  }
  async function notifyLocal(title, body) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 1e5),
            title,
            body,
            schedule: { at: new Date(Date.now() + 400) }
          }
        ]
      });
    } catch (e) {
    }
  }
  async function persistNative(key, value) {
    try {
      await Preferences.set({ key, value: String(value) });
    } catch (e) {
      try {
        localStorage.setItem(key, String(value));
      } catch (e2) {
      }
    }
  }
  window.DaxiNative = {
    platform: () => Capacitor.getPlatform(),
    isNative: () => Capacitor.isNativePlatform(),
    share: nativeShare,
    shareLocation: shareMyLocation,
    haptic,
    notifyLocal,
    getLocation: () => window._daxiLastNativeGps || null,
    isOnline: () => nativeOnline,
    persist: persistNative
  };
  async function probeBackend() {
    const base = getApiBase();
    if (!base) {
      const rec = { ok: false, status: "invalid_config", message: "Backend inaccessible" };
      if (window.DaxiApi) window.DaxiApi.lastProbe = rec;
      apiLog("Backend inaccessible (empty DAXI_API_BASE_URL)");
      return rec;
    }
    const url = backendUrl("/api/mobile/bootstrap/");
    apiLog("GET /api/mobile/bootstrap/");
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 5e3) : null;
    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        signal: ctrl ? ctrl.signal : void 0
      });
      if (timer) clearTimeout(timer);
      const kind = classifyHttpStatus(res.status);
      let rec;
      if (res.ok) rec = { ok: true, status: res.status, message: "Backend accessible", kind };
      else rec = { ok: false, status: res.status, message: kind, kind };
      if (window.DaxiApi) window.DaxiApi.lastProbe = rec;
      apiLog("Response: " + res.status);
      return rec;
    } catch (err) {
      if (timer) clearTimeout(timer);
      const kind = classifyFetchError(err);
      const rec = {
        ok: false,
        status: 0,
        kind,
        message: kind === "TIMEOUT" ? "Timeout" : "Backend inaccessible"
      };
      if (window.DaxiApi) window.DaxiApi.lastProbe = rec;
      apiLog(rec.message);
      return rec;
    }
  }
  function bootMark(n) {
    try {
      if (typeof window._daxiBootMark === "function") window._daxiBootMark(n);
    } catch (e) {
    }
  }
  function hideSplashWhenPainted() {
    if (window._daxiSplashHidden) return;
    window._daxiSplashHidden = true;
    bootMark("splash-hide");
    SplashScreen.hide({ fadeOutDuration: 220 }).catch(() => {
    });
  }
  function bindIntroSplashHandoff() {
    if (window._daxiIntroSplashBound) return;
    window._daxiIntroSplashBound = true;
    const onVisible = () => hideSplashWhenPainted();
    window.addEventListener("daxi:intro-visible", onVisible, { once: true });
    document.addEventListener("daxi:intro-visible", onVisible, { once: true });
    window.addEventListener(
      "daxi:intro-complete",
      () => {
        if (!window._daxiSplashHidden) hideSplashWhenPainted();
      },
      { once: true }
    );
  }
  async function readLaunchUrl() {
    let url = "";
    try {
      const launch = await App.getLaunchUrl();
      if (launch && launch.url) url = String(launch.url);
    } catch (e) {
    }
    if (!url) {
      try {
        url = sessionStorage.getItem("daxi_pending_deeplink") || "";
      } catch (e2) {
      }
    }
    return url;
  }
  async function boot() {
    if (!Capacitor.isNativePlatform()) return;
    bootMark("cap-js");
    markNative();
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      nativeOnline = false;
      window._daxiNativeOnline = false;
    }
    bindIntroSplashHandoff();
    bootMark("shell-ready");
    const cfg = installDaxiApiGlobal();
    if (window.DaxiApi) window.DaxiApi.probe = probeBackend;
    if (!cfg.ok) toast("[DAXI API] " + (cfg.error || "configuration invalide"));
    installDaxiDeepLink();
    installNativeBridge();
    patchNetworking();
    try {
      if (window.DaxiIntro && typeof window.DaxiIntro.play === "function" && !window._daxiIntroPromise) {
        window.DaxiIntro.play();
      }
    } catch (eIntro) {
    }
    wrapGetCsrfToken();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wrapGetCsrfToken);
    } else {
      wrapGetCsrfToken();
    }
    hookShareUi();
    initChrome().catch(() => {
    });
    initNetwork().then(() => restoreOfflineReads()).catch(() => {
    });
    readLaunchUrl().then((launchUrl) => {
      if (launchUrl) handleDeepLink(launchUrl);
      restoreShellRoleAndRedirect(launchUrl).then((redirected) => {
        if (redirected) return;
        try {
          sessionStorage.setItem("daxi_shell_nav", "1");
        } catch (eNav2) {
        }
      });
    }).catch(() => {
    });
    setTimeout(() => initNativeMap(), 0);
    bootMark("gps-start");
    initGps().catch(() => {
    });
    bootMark("push-start");
    initPush().catch(() => {
    });
    initDeepLinks().catch(() => {
    });
    probeBackend().catch(() => {
    });
    const gid = window._daxiGuestId || localStorage.getItem("daxi_guest_id") || "";
    if (gid) persistNative("guest_id", gid);
    setTimeout(() => {
      if (window._daxiOnNativeAppRevealed) window._daxiOnNativeAppRevealed();
    }, 0);
    let tries = 0;
    const flushLink = () => {
      tries += 1;
      if (window.DaxiDeepLink) window.DaxiDeepLink.ready();
      if (tries < 8) setTimeout(flushLink, 400);
    };
    setTimeout(flushLink, 200);
  }
  try {
    const ua = typeof navigator !== "undefined" && navigator.userAgent || "";
    if (Capacitor.isNativePlatform() || /DaxiAndroid|Capacitor/i.test(ua)) {
      installNativeBridge();
    }
  } catch (e) {
  }
  boot();
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
