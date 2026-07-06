#!/usr/bin/env node
import { createRequire } from 'node:module';const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify2(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify2;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify2.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn2(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn2;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify2 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify2.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify3 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify3(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify2.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify2.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify2.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep3, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep3) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep3 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep3, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep3 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep3 + cb;
              sep3 = "";
              break;
            }
            case "newline":
              if (comment)
                sep3 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep3, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep3 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep3 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep3, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep3 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep3)
                for (const st of sep3) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep3, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep3 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep3 === " ")
            sep3 = "\n";
          else if (!prevMoreIndented && sep3 === "\n")
            sep3 = "\n\n";
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep3 === "\n")
            value += "\n";
          else
            sep3 = "\n";
        } else {
          value += sep3 + content;
          sep3 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep3 = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep3 === "\n")
            res += sep3;
          else
            sep3 = "\n";
        } else {
          res += sep3 + match[1];
          sep3 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep3 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify2 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep3, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep3)
        for (const st of sep3)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify2;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep3;
          if (scalar.end) {
            sep3 = scalar.end;
            sep3.push(this.sourceToken);
            delete scalar.end;
          } else
            sep3 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep3 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep3 = it.sep;
                  sep3.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep3 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep3 = fc.end.splice(1, fc.end.length);
            sep3.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep3 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse2(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify2(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse2;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify2;
  }
});

// node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/cli.ts
import { basename as basename3 } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// src/doctor.ts
import { access } from "node:fs/promises";
import { constants } from "node:fs";

// src/config.ts
var import_yaml = __toESM(require_dist(), 1);
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// src/defaults.ts
var CONFIG_SCHEMA_VERSION = 1;
var DEFAULT_RUNS_DIR = ".pi-herd/runs";
var DEFAULT_PROMPTS_DIR = ".pi-herd/prompts";
var DEFAULT_WORKTREES_DIR = ".worktrees/";
var OUTPUT_BUDGETS = {
  terminalSummaryLines: 80,
  paneReadLines: 200,
  artifactPreviewBytes: 24e3
};
var BUILT_IN_ROLE_ORDER = ["planner", "implementer", "reviewer", "tester"];
var ROLE_DEFAULTS = {
  planner: {
    role: "planner",
    displayName: "Planner",
    expectedWrites: "artifacts",
    requiredArtifacts: ["PLAN.md"]
  },
  implementer: {
    role: "implementer",
    displayName: "Implementer",
    expectedWrites: "worktree",
    requiredArtifacts: ["IMPLEMENTATION_NOTES.md"]
  },
  reviewer: {
    role: "reviewer",
    displayName: "Reviewer",
    expectedWrites: "artifacts",
    requiredArtifacts: ["REVIEW.md"]
  },
  tester: {
    role: "tester",
    displayName: "Tester",
    expectedWrites: "artifacts",
    requiredArtifacts: ["TEST_REPORT.md"]
  }
};
var DEFAULT_ROLE_REGISTRY = {
  default: [...BUILT_IN_ROLE_ORDER],
  definitions: Object.fromEntries(
    Object.entries(ROLE_DEFAULTS).map(([role, defaults]) => [
      role,
      {
        display_name: defaults.displayName,
        expected_writes: defaults.expectedWrites,
        required_artifacts: [...defaults.requiredArtifacts]
      }
    ])
  )
};

// src/config.ts
function defaultConfig() {
  return {
    schema_version: CONFIG_SCHEMA_VERSION,
    harness: {
      default: "pi",
      profiles: {
        pi: {
          command: "pi"
        }
      }
    },
    paths: {
      runs_dir: DEFAULT_RUNS_DIR,
      prompts_dir: DEFAULT_PROMPTS_DIR
    },
    roles: cloneRoleRegistry(DEFAULT_ROLE_REGISTRY)
  };
}
function serializeConfig(config = defaultConfig()) {
  return (0, import_yaml.stringify)(config, {
    lineWidth: 0,
    nullStr: ""
  });
}
async function writeDefaultConfig(path) {
  await writeFile(path, serializeConfig(), "utf8");
}
async function loadConfig(path) {
  const raw = await readFile(path, "utf8");
  let value;
  try {
    value = (0, import_yaml.parse)(raw);
  } catch (error) {
    throw new Error(`Config YAML parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateConfig(value);
}
function validateConfig(value) {
  if (!isRecord(value)) {
    throw new Error("Config must be a YAML mapping.");
  }
  if (value.schema_version !== CONFIG_SCHEMA_VERSION) {
    throw new Error(`Config schema_version must be ${CONFIG_SCHEMA_VERSION}.`);
  }
  if (!isRecord(value.harness)) {
    throw new Error("Config harness must be a mapping.");
  }
  if (typeof value.harness.default !== "string" || value.harness.default.length === 0) {
    throw new Error("Config harness.default must be a non-empty string.");
  }
  if (!isRecord(value.harness.profiles)) {
    throw new Error("Config harness.profiles must be a mapping.");
  }
  const profiles = /* @__PURE__ */ Object.create(null);
  for (const [name, profile] of Object.entries(value.harness.profiles)) {
    if (!isSafeProfileName(name)) {
      throw new Error(`Harness profile name '${name}' is reserved.`);
    }
    if (!isRecord(profile)) {
      throw new Error(`Harness profile ${name} must be a mapping.`);
    }
    if (typeof profile.command !== "string" || profile.command.length === 0) {
      throw new Error(`Harness profile ${name} command must be a non-empty string.`);
    }
    if (profile.provider !== void 0 && profile.provider !== null && typeof profile.provider !== "string") {
      throw new Error(`Harness profile ${name} provider must be a string or null when present.`);
    }
    if (profile.model !== void 0 && profile.model !== null && typeof profile.model !== "string") {
      throw new Error(`Harness profile ${name} model must be a string or null when present.`);
    }
    if (profile.thinking !== void 0 && profile.thinking !== null && typeof profile.thinking !== "string" && !isStringRecord(profile.thinking)) {
      throw new Error(`Harness profile ${name} thinking must be a string, role map, or null when present.`);
    }
    if (profile.models !== void 0 && !isStringRecord(profile.models)) {
      throw new Error(`Harness profile ${name} models must be a role string map when present.`);
    }
    if (profile.args !== void 0 && !isStringArray(profile.args)) {
      throw new Error(`Harness profile ${name} args must be a string array when present.`);
    }
    profiles[name] = {
      command: profile.command,
      provider: profile.provider === void 0 ? void 0 : profile.provider,
      model: profile.model === void 0 ? void 0 : profile.model,
      thinking: profile.thinking === void 0 ? void 0 : cloneThinking(profile.thinking),
      models: profile.models === void 0 ? void 0 : cloneStringRecord(profile.models),
      args: profile.args === void 0 ? void 0 : [...profile.args]
    };
  }
  if (!isSafeProfileName(value.harness.default) || !Object.hasOwn(profiles, value.harness.default)) {
    throw new Error(`Config harness.default '${value.harness.default}' must reference a profile.`);
  }
  if (!isRecord(value.paths)) {
    throw new Error("Config paths must be a mapping.");
  }
  if (typeof value.paths.runs_dir !== "string" || value.paths.runs_dir.length === 0) {
    throw new Error("Config paths.runs_dir must be a non-empty string.");
  }
  if (typeof value.paths.prompts_dir !== "string" || value.paths.prompts_dir.length === 0) {
    throw new Error("Config paths.prompts_dir must be a non-empty string.");
  }
  return {
    schema_version: CONFIG_SCHEMA_VERSION,
    harness: {
      default: value.harness.default,
      profiles
    },
    paths: {
      runs_dir: value.paths.runs_dir,
      prompts_dir: value.paths.prompts_dir
    },
    roles: validateRoleRegistry(value.roles)
  };
}
function resolveConfigPath(cwd, configPath) {
  return resolve(cwd, configPath ?? ".pi-herd/config.yaml");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}
function cloneThinking(value) {
  if (value === null || typeof value === "string") {
    return value;
  }
  return cloneStringRecord(value) ?? /* @__PURE__ */ Object.create(null);
}
function cloneStringRecord(value) {
  if (value === void 0) {
    return void 0;
  }
  const clone = /* @__PURE__ */ Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    clone[key] = item;
  }
  return clone;
}
function validateRoleRegistry(value) {
  if (value === void 0) {
    return cloneRoleRegistry(DEFAULT_ROLE_REGISTRY);
  }
  if (!isRecord(value)) {
    throw new Error("Config roles must be a mapping when present.");
  }
  if (!isStringArray(value.default)) {
    throw new Error("Config roles.default must be a string array.");
  }
  if (!isRecord(value.definitions)) {
    throw new Error("Config roles.definitions must be a mapping.");
  }
  const definitions = /* @__PURE__ */ Object.create(null);
  for (const [role, definition] of Object.entries(value.definitions)) {
    assertSafeRoleName(role, `Config roles.definitions role '${role}'`);
    if (!isRecord(definition)) {
      throw new Error(`Config roles.definitions.${role} must be a mapping.`);
    }
    if (typeof definition.display_name !== "string" || definition.display_name.trim().length === 0) {
      throw new Error(`Config roles.definitions.${role}.display_name must be a non-empty string.`);
    }
    if (!isExpectedWrites(definition.expected_writes)) {
      throw new Error(`Config roles.definitions.${role}.expected_writes must be one of none, artifacts, or worktree.`);
    }
    if (definition.expected_writes === "worktree" && role !== "implementer") {
      throw new Error(`Config roles.definitions.${role}.expected_writes cannot be worktree in schema_version 1; only the built-in implementer role is materialized automatically.`);
    }
    if (!isStringArray(definition.required_artifacts)) {
      throw new Error(`Config roles.definitions.${role}.required_artifacts must be a string array.`);
    }
    for (const artifact of definition.required_artifacts) {
      if (artifact.length === 0 || artifact.includes("..") || artifact.includes("/") || artifact.includes("\\") || artifact.startsWith(".") || artifact.includes(":")) {
        throw new Error(`Config roles.definitions.${role}.required_artifacts entries must be top-level relative filenames without path traversal.`);
      }
    }
    definitions[role] = {
      display_name: definition.display_name,
      expected_writes: definition.expected_writes,
      required_artifacts: [...definition.required_artifacts]
    };
  }
  const defaultRoles = value.default.map((role) => {
    assertSafeRoleName(role, `Config roles.default role '${role}'`);
    if (!Object.hasOwn(definitions, role)) {
      throw new Error(`Config roles.default role '${role}' must reference roles.definitions.`);
    }
    return role;
  });
  return { default: defaultRoles, definitions };
}
function assertSafeRoleName(value, label = "Role name") {
  if (!isSafeRoleName(value)) {
    throw new Error(`${label} must use lowercase letters, numbers, underscores, or hyphens; start with a letter or number; and not contain path traversal or reserved object names.`);
  }
}
function isSafeRoleName(value) {
  return /^[a-z0-9][a-z0-9_-]*$/.test(value) && value !== "__proto__" && value !== "constructor" && value !== "prototype" && value !== "toString" && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}
function isExpectedWrites(value) {
  return value === "none" || value === "artifacts" || value === "worktree";
}
function cloneRoleRegistry(value) {
  const definitions = /* @__PURE__ */ Object.create(null);
  for (const [role, definition] of Object.entries(value.definitions)) {
    definitions[role] = {
      display_name: definition.display_name,
      expected_writes: definition.expected_writes,
      required_artifacts: [...definition.required_artifacts]
    };
  }
  return { default: [...value.default], definitions };
}
function isSafeProfileName(value) {
  return value !== "__proto__" && value !== "constructor" && value !== "prototype" && value !== "toString";
}

// src/doctor.ts
async function runDoctor(options) {
  const checks = [];
  checks.push(await checkGitRepo(options));
  checks.push(await checkGitWorktree(options));
  checks.push(await checkCommandPresent(options, "pi", "Pi CLI"));
  checks.push(await checkCommandPresent(options, "herdr", "Herdr CLI"));
  checks.push(await checkHerdrServer(options));
  checks.push(await checkHerdrIntegration(options));
  checks.push(await checkConfig(options));
  return {
    ok: !checks.some((check) => check.status === "fail"),
    checks
  };
}
function formatDoctorText(report) {
  const icon = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL"
  };
  const lines = report.checks.map((check) => `${icon[check.status]} ${check.label}: ${check.detail}`);
  lines.push(report.ok ? "Doctor completed with no hard failures." : "Doctor found hard failures.");
  return `${lines.join("\n")}
`;
}
async function checkGitRepo(options) {
  const result = await options.runner.run("git", ["rev-parse", "--show-toplevel"], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass("git.repo", "Git repository", firstLine(result.stdout) || "repository detected");
  }
  return fail("git.repo", "Git repository", detailFor(result, "not inside a git repository"));
}
async function checkGitWorktree(options) {
  const result = await options.runner.run("git", ["worktree", "list", "--porcelain"], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass("git.worktree", "Git worktree support", "git worktree list succeeded");
  }
  return fail("git.worktree", "Git worktree support", detailFor(result, "git worktree list failed"));
}
async function checkCommandPresent(options, command, label) {
  const result = await options.runner.run(command, ["--version"], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass(`command.${command}`, label, firstLine(result.stdout) || `${command} found`);
  }
  if (result.error?.code === "ENOENT") {
    return warn(`command.${command}`, label, `${command} was not found on PATH`);
  }
  return warn(`command.${command}`, label, detailFor(result, `${command} version check did not succeed`));
}
async function checkHerdrServer(options) {
  const result = await options.runner.run("herdr", ["workspace", "list"], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass("herdr.server", "Herdr server", "workspace list succeeded");
  }
  if (result.error?.code === "ENOENT") {
    return warn("herdr.server", "Herdr server", "herdr was not found on PATH");
  }
  return warn("herdr.server", "Herdr server", detailFor(result, "workspace list failed"));
}
async function checkHerdrIntegration(options) {
  const result = await options.runner.run("herdr", ["integration", "status"], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass("herdr.integration", "Herdr Pi integration", firstLine(result.stdout) || "integration status succeeded");
  }
  if (result.error?.code === "ENOENT") {
    return warn("herdr.integration", "Herdr Pi integration", "herdr was not found on PATH");
  }
  return warn("herdr.integration", "Herdr Pi integration", detailFor(result, "integration status failed"));
}
async function checkConfig(options) {
  const path = resolveConfigPath(options.cwd, options.configPath);
  try {
    await access(path, constants.F_OK);
  } catch {
    if (options.configPath) {
      return fail("config", "Config", `requested config not found at ${path}`);
    }
    return pass("config", "Config", `no config found at ${path}; run pi-herd init to create one`);
  }
  try {
    await loadConfig(path);
    return pass("config", "Config", `valid config at ${path}`);
  } catch (error) {
    return fail("config", "Config", error instanceof Error ? error.message : String(error));
  }
}
function pass(id, label, detail) {
  return { id, label, status: "pass", detail };
}
function warn(id, label, detail) {
  return { id, label, status: "warn", detail };
}
function fail(id, label, detail) {
  return { id, label, status: "fail", detail };
}
function firstLine(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}
function detailFor(result, fallback) {
  if (result.timedOut) {
    return "command timed out";
  }
  if (result.error?.message) {
    return result.error.message;
  }
  return firstLine(result.stderr) || firstLine(result.stdout) || fallback;
}

// src/command-runner.ts
import { spawn } from "node:child_process";
var DEFAULT_TIMEOUT_MS = 1e4;
var nodeCommandRunner = {
  run(command, args, options) {
    return new Promise((resolve6) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        stdio: ["ignore", "pipe", "pipe"]
      });
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let stdout = "";
      let stderr = "";
      let settled = false;
      let closed = false;
      let killTimer;
      const finish = (result, clearEscalation = true) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (clearEscalation && killTimer) {
          clearTimeout(killTimer);
        }
        resolve6(result);
      };
      const safeKill = (signal) => {
        try {
          child.kill(signal);
        } catch {
        }
      };
      const timer = setTimeout(() => {
        safeKill("SIGTERM");
        child.stdout?.destroy();
        child.stderr?.destroy();
        killTimer = setTimeout(() => {
          if (!closed) {
            safeKill("SIGKILL");
          }
        }, 250);
        finish({ exitCode: null, stdout, stderr, timedOut: true }, false);
      }, timeoutMs);
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        finish({ exitCode: null, stdout, stderr, error });
      });
      child.on("close", (exitCode) => {
        closed = true;
        if (killTimer) {
          clearTimeout(killTimer);
        }
        finish({ exitCode, stdout, stderr });
      });
    });
  }
};

// src/init.ts
import { access as access2, mkdir, readFile as readFile2, writeFile as writeFile2 } from "node:fs/promises";
import { constants as constants2 } from "node:fs";
import { dirname as dirname2, join, resolve as resolve2 } from "node:path";
var GITIGNORE_LINES = [`/${DEFAULT_RUNS_DIR}/`, `/${DEFAULT_WORKTREES_DIR.replace(/\/$/, "")}/`];
async function runInit(options) {
  const configPath = resolveConfigPath(options.cwd, options.configPath);
  const configDir = dirname2(configPath);
  const runsDir = resolve2(options.cwd, DEFAULT_RUNS_DIR);
  const promptsDir = resolve2(options.cwd, DEFAULT_PROMPTS_DIR);
  const result = { configPath, created: [], updated: [], skipped: [] };
  await ensureDir(configDir, result);
  await ensureDir(runsDir, result);
  await ensureDir(promptsDir, result);
  if (await exists(configPath)) {
    if (options.force) {
      await writeDefaultConfig(configPath);
      result.updated.push(configPath);
    } else {
      result.skipped.push(configPath);
    }
  } else {
    await writeDefaultConfig(configPath);
    result.created.push(configPath);
  }
  const config = defaultConfig();
  for (const role of config.roles.default) {
    const definition = config.roles.definitions[role];
    const path = join(promptsDir, `${role}.md`);
    const body = promptTemplate(definition.display_name, definition.expected_writes, definition.required_artifacts);
    if (await exists(path)) {
      if (options.force) {
        await writeFile2(path, body, "utf8");
        result.updated.push(path);
      } else {
        result.skipped.push(path);
      }
    } else {
      await writeFile2(path, body, "utf8");
      result.created.push(path);
    }
  }
  await updateGitignore(options.cwd, result);
  return result;
}
function formatInitText(result) {
  const lines = [`Initialized pi-herd config at ${result.configPath}.`];
  if (result.created.length) {
    lines.push(`Created ${result.created.length} item(s).`);
  }
  if (result.updated.length) {
    lines.push(`Updated ${result.updated.length} item(s).`);
  }
  if (result.skipped.length) {
    lines.push(`Skipped ${result.skipped.length} existing item(s). Use --force to overwrite config and prompts.`);
  }
  return `${lines.join("\n")}
`;
}
async function ensureDir(path, result) {
  if (await exists(path)) {
    return;
  }
  await mkdir(path, { recursive: true });
  result.created.push(path);
}
async function updateGitignore(cwd, result) {
  const path = resolve2(cwd, ".gitignore");
  let existing = "";
  if (await exists(path)) {
    existing = await readFile2(path, "utf8");
  }
  const existingLines = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const missing = GITIGNORE_LINES.filter((line) => !existingLines.has(line));
  if (!missing.length) {
    result.skipped.push(path);
    return;
  }
  const prefix = existing.length && !existing.endsWith("\n") ? "\n" : "";
  const body = `${existing}${prefix}${missing.join("\n")}
`;
  await writeFile2(path, body, "utf8");
  if (existing.length) {
    result.updated.push(path);
  } else {
    result.created.push(path);
  }
}
async function exists(path) {
  try {
    await access2(path, constants2.F_OK);
    return true;
  } catch {
    return false;
  }
}
function promptTemplate(displayName, expectedWrites, requiredArtifacts) {
  const role = displayName.toLowerCase();
  const repeatedPass = role === "reviewer" || role === "tester" ? "\nFor repeated passes, wait for the lead to refresh your role worktree before reviewing or testing again.\nTreat your role worktree as read-only source context and write durable findings only to the required artifact in the canonical run directory.\n" : "";
  return `# ${displayName} prompt template

You are the ${role} worker for a pi-herd run.
Write durable results to the canonical run directory.

Expected writes: ${expectedWrites}.
Required artifact(s): ${requiredArtifacts.join(", ")}.
${repeatedPass}
When a pass is complete, end your required artifact with the line: pi-herd-verdict: done pass=<N> <one-line summary>.
Use blocked instead of done when you cannot proceed, and take <N> from the [pi-herd] instruction line in the prompt that started the pass.

Follow the lead session's instructions and leave questions in the lead inbox instead of coordinating directly with other workers.
`;
}

// src/run-state.ts
import { access as access4, lstat as lstat2, mkdir as mkdir2, readFile as readFile3, readdir, realpath, rename, rm, stat, writeFile as writeFile3 } from "node:fs/promises";
import { constants as constants4 } from "node:fs";
import { basename, dirname as dirname3, isAbsolute as isAbsolute2, join as join2, relative as relative2, resolve as resolve4, sep as sep2 } from "node:path";
import { randomUUID } from "node:crypto";

// src/worktree.ts
import { access as access3, lstat } from "node:fs/promises";
import { constants as constants3 } from "node:fs";
import { isAbsolute, relative, resolve as resolve3, sep } from "node:path";

// src/herdr.ts
var HERDR_LAUNCH_TIMEOUT_MS = 3e4;
var HERDR_PROMPT_TIMEOUT_MS = 1e4;
var HERDR_READY_WAIT_TIMEOUT_MS = 15e3;
var HERDR_READY_RUNNER_TIMEOUT_MS = 2e4;
var HERDR_WORKTREE_CREATE_TIMEOUT_MS = 12e4;
var HERDR_DELIVERY_ACK_TIMEOUT_MS = 1e4;
var HERDR_NOTIFICATION_TIMEOUT_MS = 1e4;
function workspaceCreate(runner, cwd, options) {
  return runner.run("herdr", ["workspace", "create", "--cwd", options.repoRoot, "--label", options.label, "--no-focus"], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}
function agentStart(runner, cwd, options) {
  return runner.run("herdr", [
    "agent",
    "start",
    options.name,
    "--cwd",
    options.sessionCwd,
    "--workspace",
    options.workspaceId,
    "--split",
    "down",
    "--no-focus",
    "--",
    options.command,
    ...options.args
  ], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}
function paneSplit(runner, cwd, options) {
  return runner.run("herdr", ["pane", "split", options.parentPaneId, "--direction", "down", "--cwd", options.sessionCwd, "--no-focus"], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}
function paneRun(runner, cwd, paneId, command, args) {
  return runner.run("herdr", ["pane", "run", paneId, command, ...args], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}
function paneCurrent(runner, cwd) {
  return runner.run("herdr", ["pane", "current", "--current"], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}
async function verifyCurrentPane(runner, cwd, paneId) {
  try {
    const current = await paneCurrent(runner, cwd);
    if (current.exitCode !== 0) {
      return null;
    }
    const metadata = parsePaneMetadata(current.stdout);
    if (metadata.paneId !== paneId) {
      return null;
    }
    return { workspaceId: metadata.workspaceId, tabId: metadata.tabId };
  } catch {
    return null;
  }
}
function paneGet(runner, cwd, paneId) {
  return runner.run("herdr", ["pane", "get", paneId], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}
function paneClose(runner, cwd, paneId) {
  return runner.run("herdr", ["pane", "close", paneId], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}
function paneSendText(runner, cwd, paneId, message) {
  return runner.run("herdr", ["pane", "send-text", paneId, message], { cwd, timeoutMs: HERDR_PROMPT_TIMEOUT_MS });
}
function paneSendEnter(runner, cwd, paneId) {
  return runner.run("herdr", ["pane", "send-keys", paneId, "enter"], { cwd, timeoutMs: HERDR_PROMPT_TIMEOUT_MS });
}
function paneSendEscape(runner, cwd, paneId) {
  return runner.run("herdr", ["pane", "send-keys", paneId, "escape"], { cwd, timeoutMs: HERDR_PROMPT_TIMEOUT_MS });
}
function waitAgentStatus(runner, cwd, paneId, status = "idle", timeoutMs = HERDR_READY_WAIT_TIMEOUT_MS) {
  return runner.run("herdr", ["wait", "agent-status", paneId, "--status", status, "--timeout", String(timeoutMs)], { cwd, timeoutMs: HERDR_READY_RUNNER_TIMEOUT_MS });
}
function worktreeRemove(runner, cwd, options) {
  return runner.run("herdr", ["worktree", "remove", "--workspace", options.workspaceId, ...options.force ? ["--force"] : []], { cwd, timeoutMs: HERDR_WORKTREE_CREATE_TIMEOUT_MS });
}
function notificationShow(runner, cwd, options) {
  return runner.run("herdr", ["notification", "show", options.title, ...options.body ? ["--body", options.body] : [], ...options.sound ? ["--sound", options.sound] : []], { cwd, timeoutMs: HERDR_NOTIFICATION_TIMEOUT_MS });
}
function worktreeCreate(runner, cwd, options) {
  return runner.run("herdr", [
    "worktree",
    "create",
    "--cwd",
    options.repoRoot,
    "--branch",
    options.branch,
    "--base",
    options.baseRef,
    "--path",
    options.path,
    "--label",
    options.label,
    "--no-focus",
    "--json"
  ], { cwd, timeoutMs: HERDR_WORKTREE_CREATE_TIMEOUT_MS });
}
function parsePaneMetadata(stdout) {
  const parsed = parseJsonRecord(stdout);
  const records = metadataContainers(parsed, ["result", "data", "pane", "agent", "workspace", "terminal"]);
  return {
    paneId: explicitPaneIdFromRecords(records),
    workspaceId: stringFromRecords(records, ["workspace_id", "workspaceId", "herdr_workspace_id"]),
    tabId: stringFromRecords(records, ["tab_id", "tabId", "herdr_tab_id"])
  };
}
function parseAgentStatus(stdout) {
  const parsed = parseJsonRecord(stdout);
  const records = metadataContainers(parsed, ["result", "data", "pane", "agent"]);
  return stringFromRecords(records, ["agent_status", "agentStatus"]);
}
function parseWorktreeCreateResult(stdout, options) {
  const value = parseJsonRecord(stdout);
  for (const container of metadataContainers(value, ["result", "data"])) {
    const workspaceId = stringFromNullableRecords([container, childRecord(container, "workspace"), childRecord(container, "worktree")], ["workspace_id", "workspaceId", "id", "herdr_workspace_id"]);
    const path = stringFromNullableRecords([container, childRecord(container, "worktree"), childRecord(container, "checkout")], ["path", "checkout_path", "worktree_path"]);
    const branch = stringFromNullableRecords([container, childRecord(container, "worktree"), childRecord(container, "checkout")], ["branch", "branch_name"]);
    if (workspaceId && path && branch === options.branch && options.isAbsolutePath(path) && options.normalizePath(path) === options.normalizePath(options.path)) {
      return {
        role: options.role,
        branch: options.branch,
        path: options.path,
        provider: "herdr",
        herdr_workspace_id: workspaceId
      };
    }
  }
  return null;
}
function describeFailure(result, fallback) {
  if (result.error) {
    return result.error.code ? `${result.error.code}: ${result.error.message}` : result.error.message;
  }
  if (result.timedOut) {
    return `${fallback} timed out`;
  }
  return firstLine2(result.stderr) || firstLine2(result.stdout) || fallback;
}
function firstLine2(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}
function parseJsonRecord(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return /* @__PURE__ */ Object.create(null);
  }
  return /* @__PURE__ */ Object.create(null);
}
function metadataContainers(value, childKeys) {
  const containers = [];
  const queue = [value];
  while (queue.length) {
    const container = queue.shift();
    if (!container) continue;
    containers.push(container);
    for (const key of childKeys) {
      const child = childRecord(container, key);
      if (child) {
        queue.push(child);
      }
    }
  }
  return containers;
}
function explicitPaneIdFromRecords(records) {
  return stringFromRecords(records, ["pane_id", "paneId", "herdr_pane_id"]) ?? stringFromPaneContainers(records);
}
function stringFromPaneContainers(records) {
  for (const record of records) {
    for (const key of ["pane", "terminal"]) {
      const child = childRecord(record, key);
      if (child) {
        const id = child.id;
        if (typeof id === "string" && id.length > 0) {
          return id;
        }
      }
    }
  }
  return null;
}
function childRecord(value, key) {
  const child = value[key];
  if (child && typeof child === "object" && !Array.isArray(child)) {
    return child;
  }
  return null;
}
function stringFromRecords(records, keys) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  return null;
}
function stringFromNullableRecords(records, keys) {
  return stringFromRecords(records.filter(Boolean), keys);
}

// src/worktree.ts
async function materializeWorktrees(options) {
  if (!options.skipCleanCheck) {
    await assertRepoClean(options.runner, options.state.repo_root, options.cleanCheckIgnorePaths);
  }
  const roles = rolesToMaterialize(options.state, options.plannerWorktree);
  const materialized = [];
  for (const role of roles) {
    const baseRef = role === "reviewer" || role === "tester" ? options.state.roles[role]?.source_ref : options.state.base_ref;
    const result = await materializeRoleWorktree({ ...options, role, baseRef, skipCleanCheck: true });
    materialized.push(result);
  }
  return materialized;
}
async function materializeRoleWorktree(options) {
  if (!options.skipCleanCheck) {
    await assertRepoClean(options.runner, options.state.repo_root, options.cleanCheckIgnorePaths);
  }
  const record = options.state.roles[options.role];
  if (!record?.branch) {
    throw new Error(`Role ${options.role} is not selected for this run.`);
  }
  if (record.worktree_status === "materialized" && record.worktree_path) {
    return {
      role: options.role,
      branch: record.branch,
      path: record.worktree_path,
      provider: record.worktree_provider ?? "git",
      herdr_workspace_id: record.worktree_herdr_workspace_id ?? null
    };
  }
  const baseRef = options.baseRef ?? record.source_ref ?? options.state.base_ref;
  if (record.source_ref) {
    await assertRefAvailable(options.runner, options.state.repo_root, baseRef, options.role);
  }
  const worktreePath = roleWorktreePath(options.state.repo_root, options.state.run_id, options.role);
  await assertNoSymlinkPathComponents(options.state.repo_root, worktreePath);
  await assertPathAvailable(worktreePath);
  await assertBranchAvailable(options.runner, options.state.repo_root, record.branch);
  const result = await createWorktreeHerdrFirst({
    runner: options.runner,
    repoRoot: options.state.repo_root,
    role: options.role,
    runSlug: options.state.run_slug,
    branch: record.branch,
    baseRef,
    path: worktreePath
  });
  record.worktree_path = result.path;
  record.worktree_status = "materialized";
  record.worktree_provider = result.provider;
  record.worktree_herdr_workspace_id = result.herdr_workspace_id;
  record.herdr_workspace_id = result.herdr_workspace_id;
  await options.onMaterialized?.(result);
  return result;
}
function rolesToMaterialize(state, plannerWorktree) {
  const roles = [];
  if (state.roles.implementer) {
    roles.push("implementer");
  }
  if (plannerWorktree && state.roles.planner) {
    roles.push("planner");
  }
  return roles;
}
function roleWorktreePath(repoRoot, runId, role) {
  return resolve3(repoRoot, DEFAULT_WORKTREES_DIR, "pi-herd", runId, role);
}
async function assertRepoClean(runner, repoRoot, ignorePaths = []) {
  const excludes = Array.from(new Set([".pi-herd/runs", ".worktrees", ...ignorePaths].filter(Boolean))).map((path) => `:!${path}`);
  const result = await runner.run("git", ["status", "--porcelain", "--untracked-files=all", "--", ".", ...excludes], { cwd: repoRoot });
  if (result.exitCode !== 0) {
    throw new Error(`Could not check repository status: ${firstLine2(result.stderr) || firstLine2(result.stdout) || "git status failed"}`);
  }
  if (result.stdout.trim()) {
    throw new Error("Repository has uncommitted changes. Commit, stash, or clean them before creating worktrees.");
  }
}
async function assertPathAvailable(path) {
  try {
    await access3(path, constants3.F_OK);
  } catch {
    return;
  }
  throw new Error(`Worktree path already exists: ${path}`);
}
async function assertNoSymlinkPathComponents(repoRoot, worktreePath) {
  const relativeWorktreePath = relative(repoRoot, worktreePath);
  if (!relativeWorktreePath || relativeWorktreePath === ".." || relativeWorktreePath.startsWith(`..${sep}`) || isAbsolute(relativeWorktreePath)) {
    throw new Error("Worktree path must stay within the repository root.");
  }
  let current = repoRoot;
  for (const segment of relativeWorktreePath.split(sep)) {
    current = resolve3(current, segment);
    try {
      const stat3 = await lstat(current);
      if (stat3.isSymbolicLink()) {
        throw new Error("Worktree path must not include symbolic links.");
      }
    } catch (error) {
      if (isNodeErrorWithCode(error, "ENOENT")) {
        return;
      }
      throw error;
    }
  }
}
function isNodeErrorWithCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
async function assertBranchAvailable(runner, repoRoot, branch) {
  const result = await runner.run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoRoot });
  if (result.exitCode === 0) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  if (result.exitCode === 1) {
    return;
  }
  throw new Error(`Could not check branch ${branch}: ${firstLine2(result.stderr) || firstLine2(result.stdout) || "git show-ref failed"}`);
}
async function assertRefAvailable(runner, repoRoot, ref, role) {
  const result = await runner.run("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: repoRoot });
  if (result.exitCode === 0) {
    return;
  }
  throw new Error(`Cannot materialize ${role} worktree because source ref '${ref}' is unavailable.`);
}
async function createWorktreeHerdrFirst(options) {
  const label = `pi-herd ${options.runSlug} ${options.role}`;
  const herdr = await worktreeCreate(options.runner, options.repoRoot, {
    repoRoot: options.repoRoot,
    branch: options.branch,
    baseRef: options.baseRef,
    path: options.path,
    label
  });
  if (herdr.exitCode === 0) {
    const herdrResult = parseHerdrWorktreeResult(herdr.stdout, options);
    if (herdrResult) {
      return herdrResult;
    }
    throw new Error(`Could not create worktree for ${options.role}. Herdr: herdr worktree create returned unusable JSON metadata`);
  }
  if (herdr.timedOut) {
    throw new Error(`Could not create worktree for ${options.role}. Herdr: herdr worktree create timed out`);
  }
  const git2 = await options.runner.run("git", ["worktree", "add", "-b", options.branch, options.path, options.baseRef], { cwd: options.repoRoot, timeoutMs: HERDR_WORKTREE_CREATE_TIMEOUT_MS });
  if (git2.exitCode !== 0) {
    const herdrDetail = firstLine2(herdr.stderr) || firstLine2(herdr.stdout) || herdr.error?.message || "herdr worktree create failed";
    const gitDetail = firstLine2(git2.stderr) || firstLine2(git2.stdout) || git2.error?.message || "git worktree add failed";
    throw new Error(`Could not create worktree for ${options.role}. Herdr: ${herdrDetail}. Git: ${gitDetail}`);
  }
  return {
    role: options.role,
    branch: options.branch,
    path: options.path,
    provider: "git",
    herdr_workspace_id: null
  };
}
function parseHerdrWorktreeResult(stdout, options) {
  return parseWorktreeCreateResult(stdout, {
    role: options.role,
    branch: options.branch,
    path: options.path,
    isAbsolutePath: isAbsolute,
    normalizePath: resolve3
  });
}

// src/run-state.ts
async function createRun(options) {
  const goal = options.goal.trim();
  if (!goal) {
    throw new Error("Run goal must be a non-empty string.");
  }
  const runner = options.runner ?? nodeCommandRunner;
  const repoRoot = await resolveRepoRoot(options.cwd, runner);
  const config = await loadConfigIfPresent(options.configPath ? options.cwd : repoRoot, options.configPath);
  const runsRoot = resolveRunsRoot(repoRoot, config.paths.runs_dir || DEFAULT_RUNS_DIR);
  await assertNoSymlinkPathComponents2(repoRoot, runsRoot);
  const cleanCheckIgnorePaths = [relative2(repoRoot, runsRoot), ".worktrees"];
  const harness = config.harness.default;
  const roles = uniqueRoles(options.roles?.length ? options.roles : config.roles.default);
  for (const role of roles) {
    assertSafeRoleName(role);
    if (!Object.hasOwn(config.roles.definitions, role)) {
      throw new Error(`Role ${role} is not defined in config roles.definitions.`);
    }
  }
  const shouldMaterializeWorktrees = options.withWorktrees === "auto" ? roles.includes("implementer") || Boolean(options.plannerWorktree && roles.includes("planner")) : Boolean(options.withWorktrees);
  if (shouldMaterializeWorktrees) {
    await assertRepoClean(runner, repoRoot, cleanCheckIgnorePaths);
  }
  const now = options.now ?? /* @__PURE__ */ new Date();
  const createdAt = now.toISOString();
  const baseSlug = slugify(goal);
  const timestamp = formatRunTimestamp(now);
  const { runId, runSlug, runDir } = await allocateRunDirectory(repoRoot, runsRoot, timestamp, baseSlug);
  const inboxDir = join2(runDir, "inbox");
  const logsDir = join2(runDir, "logs");
  const requestPath = join2(runDir, "REQUEST.md");
  const statePath = join2(runDir, "state.json");
  const created = [runDir];
  await mkdir2(inboxDir, { recursive: true });
  created.push(inboxDir);
  await mkdir2(logsDir, { recursive: true });
  created.push(logsDir);
  const state = {
    schema_version: 1,
    run_id: runId,
    run_slug: runSlug,
    goal,
    status: "active",
    created_at: createdAt,
    updated_at: createdAt,
    repo_root: repoRoot,
    base_ref: options.baseRef ?? await resolveBaseRef(repoRoot, runner),
    canonical_run_dir: runDir,
    lead_binding: {
      role: "lead",
      harness,
      herdr_workspace_id: null,
      herdr_tab_id: null,
      herdr_pane_id: null,
      session_ref: null
    },
    role_order: roles,
    roles: /* @__PURE__ */ Object.create(null)
  };
  for (const role of roles) {
    state.roles[role] = createRoleRecord(role, config.roles.definitions[role], harness, runId);
  }
  await writeFile3(requestPath, formatRequest(state), "utf8");
  created.push(requestPath);
  await writeJsonAtomic(statePath, state);
  created.push(statePath);
  let worktrees = [];
  if (shouldMaterializeWorktrees) {
    try {
      worktrees = await materializeWorktrees({
        state,
        runner,
        plannerWorktree: options.plannerWorktree,
        cleanCheckIgnorePaths: [...cleanCheckIgnorePaths, relative2(repoRoot, runDir)],
        skipCleanCheck: true,
        onMaterialized: async () => {
          state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
          await writeJsonAtomic(statePath, state);
        }
      });
    } catch (error) {
      state.status = "failed";
      state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await writeJsonAtomic(statePath, state);
      throw error;
    }
  }
  return { state, requestPath, statePath, inboxDir, logsDir, created, worktrees, config };
}
async function listRuns(cwd, configPath, runner = nodeCommandRunner, includeAll = false) {
  const repoRoot = await resolveRepoRoot(cwd, runner);
  const config = await loadConfigIfPresent(configPath ? cwd : repoRoot, configPath);
  const runsRoot = resolveRunsRoot(repoRoot, config.paths.runs_dir || DEFAULT_RUNS_DIR);
  await assertNoSymlinkPathComponents2(repoRoot, runsRoot);
  return listRunsInRoot(runsRoot, includeAll);
}
async function resolveRunContext(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const activeRuns = await listRunsForInvocation(options.cwd, options.configPath, runner, false);
  let summary;
  if (options.run) {
    const runs = options.includeAllForExplicitRun ? await listRunsForInvocation(options.cwd, options.configPath, runner, true) : activeRuns;
    summary = selectRunFromSummaries(runs, options.run, options.includeAllForExplicitRun ? "runs" : "active runs");
  } else {
    const paneMatch = await resolveRunByCurrentPane(options, activeRuns, runner);
    summary = paneMatch ?? selectRunFromSummaries(activeRuns);
  }
  const statePath = join2(summary.canonical_run_dir, "state.json");
  return { state: await readRunState(statePath), statePath, summary };
}
async function listRunsForInvocation(cwd, configPath, runner = nodeCommandRunner, includeAll = false) {
  const primaryCwd = resolve4(cwd);
  const seen = /* @__PURE__ */ new Set();
  const runs = [];
  for (const candidate of await invocationRunSearchCwds(cwd, runner)) {
    try {
      for (const run of await listRuns(candidate, configPath, runner, includeAll)) {
        if (!seen.has(run.canonical_run_dir)) {
          seen.add(run.canonical_run_dir);
          runs.push(run);
        }
      }
    } catch (error) {
      if (candidate === primaryCwd) {
        throw error;
      }
    }
  }
  return runs.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
function selectRunFromSummaries(runs, selector, noun = "active runs") {
  if (selector) {
    if (selector === "latest") {
      const latest = runs.at(-1);
      if (!latest) throw new Error(`No ${noun} found.`);
      return latest;
    }
    const matches = runs.filter((run) => run.run_id === selector || run.run_slug === selector);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Run selector '${selector}' is ambiguous. Pass a run_id.
${formatRunChoices(matches)}`);
    throw new Error(`No ${noun.slice(0, -1)} matched '${selector}'.`);
  }
  if (runs.length === 1) return runs[0];
  if (!runs.length) throw new Error(`No ${noun} found.`);
  throw new Error(`Multiple active runs found. Pass --run <run_id|slug>.
${formatRunChoices(runs)}`);
}
async function listRunsInRoot(runsRoot, includeAll) {
  let entries;
  try {
    entries = await readdir(runsRoot);
  } catch {
    return [];
  }
  const runs = [];
  for (const entry of entries) {
    try {
      const state = await readRunState(join2(runsRoot, entry, "state.json"));
      if (includeAll || state.status === "active") {
        runs.push(toSummary(state));
      }
    } catch {
      continue;
    }
  }
  return runs.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
async function resolveRunByCurrentPane(options, runs, runner) {
  const env = options.env ?? process.env;
  if (env.HERDR_ENV !== "1" || !env.HERDR_PANE_ID || env.PI_CODING_AGENT !== "true") {
    return null;
  }
  const matches = [];
  for (const run of runs) {
    const state = await readRunState(join2(run.canonical_run_dir, "state.json"));
    const verified = await verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
    if (!verified) continue;
    if (state.lead_binding.herdr_pane_id === env.HERDR_PANE_ID || Object.values(state.roles).some((role) => role?.herdr_pane_id === env.HERDR_PANE_ID)) {
      matches.push(run);
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Current pane matches multiple active runs. Pass --run <run_id|slug>.
${formatRunChoices(matches)}`);
  return null;
}
async function invocationRunSearchCwds(cwd, runner) {
  const candidates = [resolve4(cwd)];
  const gitCommonRoot = await inferCanonicalRootFromGitCommonDir(cwd, runner);
  if (gitCommonRoot) candidates.push(gitCommonRoot);
  const fallbackRoot = inferCanonicalRootFromWorktreePath(cwd);
  if (fallbackRoot) candidates.push(fallbackRoot);
  return Array.from(new Set(candidates));
}
async function inferCanonicalRootFromGitCommonDir(cwd, runner) {
  let result;
  try {
    result = await runner.run("git", ["rev-parse", "--git-common-dir"], { cwd });
  } catch {
    return null;
  }
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return null;
  }
  const commonDir = resolve4(cwd, result.stdout.trim());
  if (basename(commonDir) !== ".git") {
    return null;
  }
  return dirname3(commonDir);
}
function inferCanonicalRootFromWorktreePath(cwd) {
  const absolute = resolve4(cwd);
  const parts = absolute.split(sep2);
  const markerParts = DEFAULT_WORKTREES_DIR.split(/[\\/]+/).filter(Boolean);
  for (let markerIndex = parts.length - markerParts.length; markerIndex > 0; markerIndex -= 1) {
    if (!markerParts.every((part, offset) => parts[markerIndex + offset] === part)) continue;
    const piHerdIndex = markerIndex + markerParts.length;
    if (parts[piHerdIndex] !== "pi-herd" || parts.length < piHerdIndex + 3) continue;
    const root = parts.slice(0, markerIndex).join(sep2) || sep2;
    if (!root || root === absolute || !isAbsolute2(root)) return null;
    return root;
  }
  return null;
}
function formatRunCreateText(result) {
  const lines = [
    `Created run ${result.state.run_id}`,
    `Goal: ${result.state.goal}`,
    `Run directory: ${result.state.canonical_run_dir}`,
    `Request: ${result.requestPath}`,
    `State: ${result.statePath}`,
    `Inbox: ${result.inboxDir}`,
    `Logs: ${result.logsDir}`
  ];
  for (const worktree of result.worktrees) {
    lines.push(`Worktree ${worktree.role}: ${worktree.path} (${worktree.branch}, ${worktree.provider})`);
  }
  return `${lines.join("\n")}
`;
}
function parseRole(value) {
  const role = value.trim();
  assertSafeRoleName(role);
  return role;
}
async function loadConfigIfPresent(cwd, configPath) {
  const path = resolveConfigPath(cwd, configPath);
  try {
    await access4(path, constants4.F_OK);
  } catch {
    if (configPath) {
      throw new Error(`Config not found at ${path}.`);
    }
    return defaultConfig();
  }
  return loadConfig(path);
}
async function resolveRepoRoot(cwd, runner) {
  const result = await runner.run("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (result.exitCode === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  throw new Error(`Not inside a git repository: ${firstLine2(result.stderr) || firstLine2(result.stdout) || result.error?.message || "git rev-parse --show-toplevel failed"}`);
}
function resolveRunsRoot(repoRoot, runsDir) {
  if (isAbsolute2(runsDir)) {
    throw new Error("Config paths.runs_dir must be a repository-relative path.");
  }
  const runsRoot = resolve4(repoRoot, runsDir);
  if (!isPathInside(repoRoot, runsRoot)) {
    throw new Error("Config paths.runs_dir must stay within the repository root.");
  }
  return runsRoot;
}
async function assertNoSymlinkPathComponents2(repoRoot, runsRoot) {
  const relativeRunsRoot = relative2(repoRoot, runsRoot);
  if (!relativeRunsRoot) {
    return;
  }
  let current = repoRoot;
  for (const segment of relativeRunsRoot.split(sep2)) {
    current = join2(current, segment);
    try {
      const stat3 = await lstat2(current);
      if (stat3.isSymbolicLink()) {
        throw new Error("Config paths.runs_dir must not include symbolic links.");
      }
    } catch (error) {
      if (isNodeErrorWithCode2(error, "ENOENT")) {
        return;
      }
      throw error;
    }
  }
}
async function assertRealPathInsideRepo(repoRoot, runsRoot) {
  const [realRepoRoot, realRunsRoot] = await Promise.all([realpath(repoRoot), realpath(runsRoot)]);
  if (!isPathInside(realRepoRoot, realRunsRoot)) {
    throw new Error("Config paths.runs_dir must stay within the repository root.");
  }
}
function isPathInside(root, candidate) {
  const relativeCandidate = relative2(root, candidate);
  return relativeCandidate === "" || !relativeCandidate.startsWith(`..${sep2}`) && relativeCandidate !== ".." && !isAbsolute2(relativeCandidate);
}
function isNodeErrorWithCode2(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
async function resolveBaseRef(repoRoot, runner) {
  const branch = await runner.run("git", ["symbolic-ref", "--short", "HEAD"], { cwd: repoRoot });
  if (branch.exitCode === 0 && branch.stdout.trim()) {
    return branch.stdout.trim();
  }
  const commit = await runner.run("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot });
  if (commit.exitCode === 0 && commit.stdout.trim()) {
    return commit.stdout.trim();
  }
  throw new Error(`Could not resolve base ref: ${firstLine2(commit.stderr) || firstLine2(commit.stdout) || commit.error?.message || "git rev-parse --short HEAD failed"}`);
}
function formatRunTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "").replace(/:/g, "-");
}
async function allocateRunDirectory(repoRoot, runsRoot, timestamp, baseSlug) {
  await mkdir2(runsRoot, { recursive: true });
  await assertRealPathInsideRepo(repoRoot, runsRoot);
  for (let index = 1; index < 1e3; index += 1) {
    const runSlug2 = index === 1 ? baseSlug : `${baseSlug}-${index}`;
    const runId2 = `${timestamp}-${runSlug2}`;
    const runDir2 = join2(runsRoot, runId2);
    try {
      await mkdir2(runDir2);
      return { runId: runId2, runSlug: runSlug2, runDir: runDir2 };
    } catch (error) {
      if (isNodeErrorWithCode2(error, "EEXIST")) {
        continue;
      }
      throw error;
    }
  }
  const runSlug = `${baseSlug}-${randomUUID().slice(0, 8)}`;
  const runId = `${timestamp}-${runSlug}`;
  const runDir = join2(runsRoot, runId);
  await mkdir2(runDir);
  return { runId, runSlug, runDir };
}
function createRoleRecord(role, definition, harness, runId) {
  const implementationBranch = `pi-herd/${runId}/impl`;
  return {
    role,
    status: "pending",
    harness,
    branch: role === "implementer" ? implementationBranch : `pi-herd/${runId}/${role}`,
    source_ref: role === "reviewer" || role === "tester" ? implementationBranch : void 0,
    worktree_path: null,
    worktree_status: "pending",
    worktree_provider: null,
    herdr_workspace_id: null,
    herdr_tab_id: null,
    herdr_pane_id: null,
    session_ref: null,
    display_name: definition.display_name,
    expected_writes: definition.expected_writes,
    required_artifacts: [...definition.required_artifacts],
    last_activity_at: null,
    pass: 0
  };
}
function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  return slug || "run";
}
function uniqueRoles(roles) {
  return Array.from(new Set(roles));
}
function formatRequest(state) {
  return `# Request

Goal: ${state.goal}

Run ID: ${state.run_id}
Created: ${state.created_at}
Base ref: ${state.base_ref}

## Instructions

This file captures the original user goal for the run.
Worker artifacts should be written to this canonical run directory.
Worker requests should be written to inbox files named {timestamp}-{from_role}-{kind}.md.
`;
}
async function writeJsonAtomic(path, value) {
  const tempPath = join2(dirname3(path), `.tmp-${process.pid}-${Date.now()}-${randomUUID()}.json`);
  await writeFile3(tempPath, `${JSON.stringify(value, null, 2)}
`, { encoding: "utf8", flag: "wx" });
  await rename(tempPath, path);
}
async function updateRunState(path, mutate) {
  const lockDir = join2(dirname3(path), ".state.lock");
  const lock = await acquireStateLock(lockDir);
  try {
    const state = await readRunState(path);
    const mutationResult = mutate(state);
    if (isThenable(mutationResult)) {
      throw new Error("Run state mutators must be synchronous");
    }
    await assertStateLockOwned(lock);
    if (mutationResult === false) {
      return state;
    }
    state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    state.state_revision = (state.state_revision ?? 0) + 1;
    await writeJsonAtomicWithStateLock(path, state, lock);
    return state;
  } finally {
    await releaseStateLock(lock);
  }
}
function isThenable(value) {
  return (typeof value === "object" || typeof value === "function") && value !== null && typeof value.then === "function";
}
async function writeJsonAtomicWithStateLock(path, value, lock) {
  const tempPath = join2(lock.lockDir, `.tmp-${process.pid}-${Date.now()}-${randomUUID()}.json`);
  try {
    await writeFile3(tempPath, `${JSON.stringify(value, null, 2)}
`, { encoding: "utf8", flag: "wx" });
    await assertStateLockOwned(lock);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
async function acquireStateLock(lockDir) {
  const started = Date.now();
  const timeoutMs = 5e3;
  const staleMs = 3e4;
  while (Date.now() - started < timeoutMs) {
    const owner = { pid: process.pid, token: randomUUID(), created_at: (/* @__PURE__ */ new Date()).toISOString() };
    try {
      await mkdir2(lockDir);
      try {
        await writeFile3(join2(lockDir, "owner.json"), JSON.stringify(owner), "utf8");
      } catch (error) {
        await rm(lockDir, { recursive: true, force: true });
        throw error;
      }
      return { lockDir, owner };
    } catch (error) {
      if (!isNodeErrorWithCode2(error, "EEXIST")) {
        throw error;
      }
      if (await removeStaleStateLock(lockDir, staleMs)) {
        continue;
      }
      await sleep(50);
    }
  }
  throw new Error(`Timed out waiting for run state lock: ${lockDir}`);
}
async function assertStateLockOwned(lock) {
  if (!await isStateLockOwned(lock)) {
    throw new Error(`Run state lock ownership was lost: ${lock.lockDir}`);
  }
}
async function isStateLockOwned(lock) {
  const owner = await readStateLockOwner(lock.lockDir);
  return sameStateLockOwner(lock.owner, owner);
}
async function releaseStateLock(lock) {
  if (!await isStateLockOwned(lock)) {
    return;
  }
  const releaseDir = `${lock.lockDir}.release-${process.pid}-${randomUUID()}`;
  try {
    await rename(lock.lockDir, releaseDir);
  } catch {
    return;
  }
  if (sameStateLockOwner(lock.owner, await readStateLockOwner(releaseDir))) {
    await rm(releaseDir, { recursive: true, force: true });
    return;
  }
  await rename(releaseDir, lock.lockDir).catch(() => void 0);
}
async function removeStaleStateLock(lockDir, staleMs) {
  const observed = await readStateLockSnapshot(lockDir);
  if (!observed || !isStateLockStale(observed, staleMs)) {
    return false;
  }
  try {
    const confirmed = await readStateLockSnapshot(lockDir);
    if (!confirmed || !sameStateLockSnapshot(observed, confirmed) || !isStateLockStale(confirmed, staleMs)) {
      return false;
    }
    const quarantineDir = `${lockDir}.stale-${process.pid}-${randomUUID()}`;
    await rename(lockDir, quarantineDir);
    const quarantined = await readStateLockSnapshot(quarantineDir);
    if (!quarantined || !sameStateLockSnapshot(observed, quarantined) || !isStateLockStale(quarantined, staleMs)) {
      await rename(quarantineDir, lockDir).catch(() => void 0);
      return false;
    }
    await rm(quarantineDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
async function readStateLockSnapshot(lockDir) {
  try {
    const lockStat = await stat(lockDir);
    return {
      owner: await readStateLockOwner(lockDir),
      mtimeMs: lockStat.mtimeMs,
      ino: lockStat.ino,
      dev: lockStat.dev
    };
  } catch {
    return null;
  }
}
async function readStateLockOwner(lockDir) {
  try {
    return JSON.parse(await readFile3(join2(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}
function isStateLockStale(snapshot, staleMs) {
  const ownerCreatedAt = typeof snapshot.owner?.created_at === "string" ? Date.parse(snapshot.owner.created_at) : NaN;
  const createdAtMs = Number.isFinite(ownerCreatedAt) ? ownerCreatedAt : snapshot.mtimeMs;
  return Date.now() - createdAtMs > staleMs;
}
function sameStateLockSnapshot(left, right) {
  return left.dev === right.dev && left.ino === right.ino && sameStateLockOwner(left.owner, right.owner) && (left.owner !== null || left.mtimeMs === right.mtimeMs);
}
function sameStateLockOwner(left, right) {
  return left?.pid === right?.pid && left?.token === right?.token && left?.created_at === right?.created_at;
}
function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
async function readRunState(path) {
  return JSON.parse(await readFile3(path, "utf8"));
}
function toSummary(state) {
  return {
    run_id: state.run_id,
    run_slug: state.run_slug,
    goal: state.goal,
    status: state.status,
    created_at: state.created_at,
    canonical_run_dir: state.canonical_run_dir
  };
}
function formatRunChoices(runs) {
  return runs.map((run) => `- ${run.run_id} (${run.run_slug}): ${run.goal}`).join("\n");
}

// src/start.ts
import { join as join3 } from "node:path";

// src/verdict.ts
var MARKER_PATTERN = /^pi-herd-verdict:\s*(done|blocked)\s+pass=(\d+)(?:\s+(.*\S))?\s*$/gim;
function parseVerdictMarker(text) {
  let last = null;
  for (const match of text.matchAll(MARKER_PATTERN)) {
    const pass2 = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(pass2) || pass2 < 1) continue;
    last = { verdict: match[1].toLowerCase(), pass: pass2, summary: match[3]?.trim() || null };
  }
  return last;
}
function verdictInstruction(artifactPath, pass2) {
  return `[pi-herd] When pass ${pass2} is complete, end ${artifactPath} with the line: pi-herd-verdict: done pass=${pass2} <one-line summary> (use blocked instead of done if you cannot proceed).`;
}

// src/start.ts
async function startRun(options) {
  const runner = options.runner ?? nodeCommandRunner;
  await assertCurrentPaneIsNotActiveLead(options, runner);
  const result = await createRun({ ...options, withWorktrees: "auto", runner });
  const statePath = result.statePath;
  const state = result.state;
  const launched = [];
  const warnings = [];
  try {
    const lead = await bindOrLaunchLead(state, result.config, runner, options.env ?? process.env);
    state.lead_binding.herdr_workspace_id = lead.workspaceId;
    state.lead_binding.herdr_tab_id = lead.tabId;
    state.lead_binding.herdr_pane_id = lead.paneId;
    state.lead_binding.session_ref = lead.sessionRef;
    state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    await writeJsonAtomic(statePath, state);
    launched.push({ role: "lead", paneId: lead.paneId, sessionRef: lead.sessionRef, launchMethod: lead.launchMethod });
    if (state.roles.planner) {
      const planner = await launchRoleSession({ state, config: result.config, runner, role: "planner", cwd: plannerCwd(state) });
      applyRoleLaunch(state.roles.planner, planner);
      state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await writeJsonAtomic(statePath, state);
      launched.push({ role: "planner", paneId: planner.paneId, sessionRef: planner.sessionRef, launchMethod: planner.launchMethod });
      const plannerReady = await waitForRoleReady(runner, state.repo_root, planner.paneId, "planner");
      if (plannerReady) {
        warnings.push(plannerReady);
      }
      const kickoffNote = await sendPlannerKickoff(runner, planner.paneId, state);
      if (kickoffNote) {
        warnings.push(kickoffNote);
      }
      state.roles.planner.status = "working";
      state.roles.planner.launch_metadata = { ...state.roles.planner.launch_metadata, prompt_method: "pane-send-text-enter" };
      state.roles.planner.last_activity_at = (/* @__PURE__ */ new Date()).toISOString();
      state.roles.planner.pass = 1;
      state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await writeJsonAtomic(statePath, state);
    }
    if (state.roles.implementer) {
      if (!state.roles.implementer.worktree_path) {
        throw new Error("Implementer worktree was not materialized; cannot launch staged implementer session.");
      }
      const implementer = await launchRoleSession({ state, config: result.config, runner, role: "implementer", cwd: state.roles.implementer.worktree_path });
      applyRoleLaunch(state.roles.implementer, implementer);
      state.roles.implementer.status = "staged";
      state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await writeJsonAtomic(statePath, state);
      launched.push({ role: "implementer", paneId: implementer.paneId, sessionRef: implementer.sessionRef, launchMethod: implementer.launchMethod });
    }
    for (const role of state.role_order ?? Object.keys(state.roles)) {
      if (role === "planner" || role === "implementer") {
        continue;
      }
      const record = state.roles[role];
      if (record) {
        record.status = "staged";
      }
    }
    state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    await writeJsonAtomic(statePath, state);
    return { ...result, launched, warnings };
  } catch (error) {
    state.status = "failed";
    state.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    await writeJsonAtomic(statePath, state);
    throw error;
  }
}
async function assertCurrentPaneIsNotActiveLead(options, runner) {
  const env = options.env ?? process.env;
  if (env.HERDR_ENV !== "1" || !env.HERDR_PANE_ID || env.PI_CODING_AGENT !== "true") {
    return;
  }
  const runs = await listRunsForInvocation(options.cwd, options.configPath, runner, false);
  for (const run of runs) {
    let state;
    try {
      state = await readRunState(join3(run.canonical_run_dir, "state.json"));
    } catch {
      continue;
    }
    if (state.status !== "active") {
      continue;
    }
    if (state.lead_binding.herdr_pane_id !== env.HERDR_PANE_ID) {
      continue;
    }
    const verified = await verifyCurrentPane2(runner, state.repo_root, env.HERDR_PANE_ID);
    if (!verified) {
      continue;
    }
    throw new Error(`Current pane is already the lead for active pi-herd run ${state.run_id} (${state.run_slug}).
Use /herd status or pi-herd status to inspect it. Complete or abandon the run with pi-herd cleanup --complete or pi-herd cleanup --abandon before starting another run from this pane.`);
  }
}
function formatStartText(result) {
  const lines = [
    `Started run ${result.state.run_id}`,
    `Goal: ${result.state.goal}`,
    `Run directory: ${result.state.canonical_run_dir}`,
    `State: ${result.statePath}`
  ];
  for (const launch of result.launched) {
    lines.push(`${launch.role}: ${launch.paneId ?? "no pane"} (${launch.launchMethod ?? "unknown"})`);
  }
  for (const warning of result.warnings) {
    lines.push(`Warning: ${warning}`);
  }
  return `${lines.join("\n")}
`;
}
function buildPiCommand(config, role, state) {
  const profile = config.harness.profiles[config.harness.default];
  if (!profile) {
    throw new Error(`Harness profile '${config.harness.default}' is not configured.`);
  }
  const record = role === "lead" ? null : state.roles[role];
  const definition = role === "lead" ? null : config.roles.definitions[role];
  if (role !== "lead" && !record && !definition) {
    throw new Error(`Role ${role} is not defined in config roles.definitions.`);
  }
  const sessionId = `${state.run_id}-${role}`;
  const name = `pi-herd-${state.run_id}-${role}`;
  const args = [...profile.args ?? [], "--name", name, "--session-id", sessionId];
  const provider = profile.provider ?? null;
  const model = role === "lead" ? profile.model ?? null : modelForRole(profile, role);
  const thinking = role === "lead" ? thinkingForRole(profile, void 0) : thinkingForRole(profile, role);
  if (provider) {
    args.push("--provider", provider);
  }
  if (model) {
    args.push("--model", model);
  }
  if (thinking) {
    args.push("--thinking", thinking);
  }
  return {
    command: profile.command,
    args,
    sessionId,
    metadata: {
      agent_name: name,
      command: profile.command,
      args: [...args],
      model,
      provider,
      thinking,
      expected_writes: record?.expected_writes ?? definition?.expected_writes ?? "none"
    }
  };
}
async function bindOrLaunchLead(state, config, runner, env) {
  if (env.HERDR_ENV === "1" && env.HERDR_PANE_ID && env.PI_CODING_AGENT === "true") {
    const verified = await verifyCurrentPane2(runner, state.repo_root, env.HERDR_PANE_ID);
    if (verified) {
      return {
        workspaceId: verified.workspaceId ?? env.HERDR_WORKSPACE_ID ?? null,
        tabId: verified.tabId ?? env.HERDR_TAB_ID ?? null,
        paneId: env.HERDR_PANE_ID,
        sessionRef: null,
        launchMethod: "bound-current-pane",
        metadata: { launch_method: "bound-current-pane", expected_writes: "none" }
      };
    }
  }
  const workspace = await createLeadWorkspace(runner, state);
  const launched = await launchHarnessInHerdr({ state, config, runner, role: "lead", cwd: state.repo_root, workspaceId: workspace.workspaceId });
  return { ...launched, workspaceId: launched.workspaceId ?? workspace.workspaceId };
}
async function launchRoleSession(options) {
  const leadWorkspace = options.state.lead_binding.herdr_workspace_id;
  if (!leadWorkspace) {
    throw new Error("Lead workspace is missing; cannot launch worker session.");
  }
  return launchHarnessInHerdr({ ...options, workspaceId: leadWorkspace });
}
async function launchHarnessInHerdr(options) {
  const spec = buildPiCommand(options.config, options.role, options.state);
  spec.metadata.cwd = options.cwd;
  const agent = await agentStart(options.runner, options.state.repo_root, {
    name: spec.metadata.agent_name ?? `pi-herd-${options.state.run_id}-${options.role}`,
    sessionCwd: options.cwd,
    workspaceId: options.workspaceId,
    command: spec.command,
    args: spec.args
  });
  if (agent.exitCode === 0) {
    const parsed = parsePaneMetadata(agent.stdout);
    if (parsed.paneId) {
      return { workspaceId: parsed.workspaceId ?? options.workspaceId, tabId: parsed.tabId, paneId: parsed.paneId, sessionRef: spec.sessionId, launchMethod: "herdr-agent-start", metadata: { ...spec.metadata, launch_method: "herdr-agent-start" } };
    }
    throw new Error(`Could not launch ${options.role}. Herdr agent start returned unusable metadata.`);
  }
  if (agent.timedOut) {
    throw new Error(`Could not launch ${options.role}. Herdr: ${describeFailure(agent, "agent start timed out")}.`);
  }
  const parentPaneId = options.state.lead_binding.herdr_pane_id;
  if (!parentPaneId) {
    throw new Error(`Could not launch ${options.role}. Herdr: ${describeFailure(agent, "agent start failed")}. Pane fallback requires a lead pane.`);
  }
  const split = await paneSplit(options.runner, options.state.repo_root, { parentPaneId, sessionCwd: options.cwd });
  if (split.exitCode !== 0) {
    throw new Error(`Could not launch ${options.role}. Herdr: ${describeFailure(agent, "agent start failed")}. Pane split: ${describeFailure(split, "pane split failed")}`);
  }
  const pane = parsePaneMetadata(split.stdout).paneId;
  if (!pane) {
    throw new Error(`Could not launch ${options.role}. Herdr pane split returned unusable metadata.`);
  }
  const paneRun2 = await paneRun(options.runner, options.state.repo_root, pane, spec.command, spec.args);
  if (paneRun2.exitCode !== 0) {
    throw new Error(`Could not launch ${options.role}. Pane run: ${describeFailure(paneRun2, "pane run failed")}`);
  }
  return { workspaceId: options.workspaceId, tabId: parsePaneMetadata(split.stdout).tabId, paneId: pane, sessionRef: spec.sessionId, launchMethod: "herdr-pane-run", metadata: { ...spec.metadata, launch_method: "herdr-pane-run" } };
}
function applyRoleLaunch(record, launch) {
  if (record.worktree_provider === "herdr" && record.herdr_workspace_id && !record.worktree_herdr_workspace_id) {
    record.worktree_herdr_workspace_id = record.herdr_workspace_id;
  }
  record.herdr_workspace_id = launch.workspaceId;
  record.herdr_tab_id = launch.tabId;
  record.herdr_pane_id = launch.paneId;
  record.session_ref = launch.sessionRef;
  record.status = "staged";
  record.launch_metadata = { ...record.launch_metadata ?? {}, ...launch.metadata ?? {}, launch_method: launch.launchMethod };
}
var verifyCurrentPane2 = verifyCurrentPane;
async function createLeadWorkspace(runner, state) {
  const result = await workspaceCreate(runner, state.repo_root, { repoRoot: state.repo_root, label: `pi-herd ${state.run_slug} lead` });
  if (result.exitCode !== 0) {
    throw new Error(`Could not create lead workspace: ${describeFailure(result, "herdr workspace create failed")}`);
  }
  const workspaceId = parsePaneMetadata(result.stdout).workspaceId ?? workspaceIdFromJson(result.stdout) ?? firstToken(result.stdout);
  if (!workspaceId) {
    throw new Error("Could not create lead workspace. Herdr returned unusable metadata.");
  }
  return { workspaceId };
}
async function sendPlannerKickoff(runner, paneId, state) {
  const planner = state.roles.planner;
  const artifact = planner?.required_artifacts[0] ?? "PLAN.md";
  const planPath = join3(state.canonical_run_dir, artifact);
  const prompt = `You are the planner for pi-herd run ${state.run_id}.
Goal: ${state.goal}
Write your plan to ${planPath}.
Do not edit source files unless explicitly instructed by the lead.

${verdictInstruction(planPath, 1)}`;
  try {
    const delivery = await sendToPane(runner, state.repo_root, paneId, prompt);
    return delivery.note ? `planner kickoff: ${delivery.note}` : null;
  } catch (error) {
    planner.status = "failed";
    throw error;
  }
}
async function sendToPane(runner, cwd, paneId, message) {
  const before = await paneGet(runner, cwd, paneId);
  const preStatus = before.exitCode === 0 ? parseAgentStatus(before.stdout) : null;
  const text = await paneSendText(runner, cwd, paneId, message);
  if (text.exitCode !== 0) {
    throw new Error(`Could not send pane text: ${describeFailure(text, "pane send-text failed")}`);
  }
  const enter = await paneSendEnter(runner, cwd, paneId);
  if (enter.exitCode !== 0) {
    throw new Error(`Could not submit pane text after text was inserted; pane may contain unsubmitted text and retry may duplicate it: ${describeFailure(enter, "pane send-keys failed")}`);
  }
  if (preStatus === "working") {
    return { verification: "ambiguous", note: `pane ${paneId} was already working before the prompt was submitted, so delivery could not be independently verified.` };
  }
  const provenNonWorking = preStatus === "idle" || preStatus === "blocked" || preStatus === "done";
  const ack = await waitAgentStatus(runner, cwd, paneId, "working", HERDR_DELIVERY_ACK_TIMEOUT_MS);
  if (ack.exitCode === 0) {
    if (provenNonWorking) {
      return { verification: "verified", note: null };
    }
    return { verification: "ambiguous", note: `pane ${paneId} reported working after submit, but its pre-send agent status was unknown, so the transition could not be proven.` };
  }
  return { verification: "unverified", note: `pane ${paneId} did not report working within ${HERDR_DELIVERY_ACK_TIMEOUT_MS / 1e3}s after submit; inspect the pane before re-sending because a retry may duplicate the prompt.` };
}
async function waitForRoleReady(runner, cwd, paneId, role) {
  const result = await waitAgentStatus(runner, cwd, paneId, "idle");
  if (result.exitCode === 0) {
    return null;
  }
  return `${role} pane did not report idle before first prompt; sent anyway (${describeFailure(result, "wait agent-status idle failed")}).`;
}
function plannerCwd(state) {
  return state.roles.planner?.worktree_path ?? state.repo_root;
}
function modelForRole(profile, role) {
  return profile.models?.[role] ?? profile.model ?? null;
}
function thinkingForRole(profile, role) {
  if (typeof profile.thinking === "string") {
    return profile.thinking;
  }
  if (role && isRoleMap(profile.thinking)) {
    return profile.thinking[role] ?? null;
  }
  return null;
}
function isRoleMap(value) {
  return Boolean(value && typeof value === "object");
}
function workspaceIdFromJson(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return workspaceIdFromWorkspaceContainers(parsed);
  } catch {
    return null;
  }
}
function workspaceIdFromWorkspaceContainers(record) {
  for (const key of ["workspace"]) {
    const child = record[key];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const id = child.id;
      if (typeof id === "string" && id.length > 0) {
        return id;
      }
    }
  }
  for (const key of ["result", "data"]) {
    const child = record[key];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const id = workspaceIdFromWorkspaceContainers(child);
      if (id) {
        return id;
      }
    }
  }
  return null;
}
function firstToken(value) {
  return firstLine2(value)?.split(/\s+/)[0] ?? null;
}

// src/messaging.ts
import { access as access5 } from "node:fs/promises";
import { constants as constants5 } from "node:fs";
import { join as join4, relative as relative3 } from "node:path";
async function sendMessage(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunState(options, runner);
  const state = resolved.state;
  const record = state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for run ${state.run_id}.`);
  }
  if (options.requireLead) {
    await assertCurrentLead(state, runner, options.env ?? process.env);
  }
  const config = await loadConfigIfPresent(options.configPath ? options.cwd : state.repo_root, options.configPath);
  const activation = await ensureRolePane({ state, statePath: resolved.statePath, config, runner, role: options.role });
  const paneId = record.herdr_pane_id;
  if (!paneId) {
    throw new Error(`Role ${options.role} has no pane after activation.`);
  }
  if (activation.launchedNow) {
    const readyWarning = await waitForRoleReady(runner, state.repo_root, paneId, options.role);
    if (readyWarning) {
      activation.notes.push(readyWarning);
    }
  }
  const reserved = await updateRunState(resolved.statePath, (fresh) => {
    const freshRecord = fresh.roles[options.role];
    if (!freshRecord) return;
    freshRecord.pass = (freshRecord.pass ?? 0) + 1;
  });
  const reservedRecord = reserved.roles[options.role];
  if (!reservedRecord) {
    throw new Error(`Role ${options.role} is not selected for run ${state.run_id}.`);
  }
  const reservedPass = reservedRecord.pass ?? 0;
  const artifactName = record.required_artifacts[0];
  const prompt = artifactName ? `${options.message}

${verdictInstruction(join4(state.canonical_run_dir, artifactName), reservedPass)}` : options.message;
  const delivery = await sendToPane(runner, state.repo_root, paneId, prompt);
  const updated = await updateRunState(resolved.statePath, (fresh) => {
    const freshRecord = fresh.roles[options.role];
    if (!freshRecord) return;
    freshRecord.status = "working";
    freshRecord.last_activity_at = (/* @__PURE__ */ new Date()).toISOString();
  });
  const warnings = capabilityWarnings(record);
  const deliveryLine = delivery.verification === "verified" ? `Delivery verified: ${options.role} reported working.` : `Warning: ${delivery.note}`;
  const textLines = [`Sent message to ${options.role} (${paneId}).`];
  if (artifactName) {
    textLines.push(`Pass ${reservedPass}: verdict instruction appended to the prompt.`);
  }
  textLines.push(deliveryLine, ...activation.notes, ...warnings.map((warning) => `Warning: ${warning}`));
  return {
    state: updated,
    text: textLines.join("\n") + "\n"
  };
}
async function interruptRole(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunState(options, runner);
  const state = resolved.state;
  const record = state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for run ${state.run_id}.`);
  }
  const paneId = record.herdr_pane_id;
  if (!paneId) {
    throw new Error(`Role ${options.role} has no launched pane to interrupt.`);
  }
  const pane = await paneGet(runner, state.repo_root, paneId);
  if (pane.exitCode !== 0) {
    if (!pane.timedOut && !pane.error && isMissingPaneFailure(pane)) {
      throw new Error(`Role ${options.role} pane ${paneId} is missing; nothing to interrupt.`);
    }
    throw new Error(`Could not validate ${options.role} pane ${paneId}: ${describeFailure(pane, "pane get failed")}`);
  }
  const escape = await paneSendEscape(runner, state.repo_root, paneId);
  if (escape.exitCode !== 0) {
    throw new Error(`Could not send Escape to ${options.role} pane ${paneId}: ${describeFailure(escape, "pane send-keys failed")}`);
  }
  const updated = await updateRunState(resolved.statePath, (fresh) => {
    const freshRecord = fresh.roles[options.role];
    if (!freshRecord) return;
    freshRecord.status = "blocked";
    freshRecord.last_activity_at = (/* @__PURE__ */ new Date()).toISOString();
  });
  return {
    state: updated,
    text: `Sent Escape to ${options.role} (${paneId}) and marked the stored role status blocked.
Re-prompt with pi-herd send ${options.role} <message> when the role should resume.
`
  };
}
async function leadStatus(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const { state } = await resolveRunState(options, runner);
  const lines = [
    `Run ${state.run_id}`,
    `Goal: ${state.goal}`,
    `Status: ${state.status}`,
    `Lead pane: ${state.lead_binding.herdr_pane_id ?? "none"}`,
    "Roles:"
  ];
  for (const role of roleEntries(state)) {
    lines.push(`- ${role.role}: ${role.status}; pane=${role.herdr_pane_id ?? "none"}; worktree=${role.worktree_status}; session=${role.session_ref ?? "none"}`);
  }
  return { state, text: `${lines.join("\n")}
` };
}
async function leadBrief(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const { state } = await resolveRunState(options, runner);
  const artifacts = await artifactInventory(state);
  const inbox = await inboxInventory(state);
  const warnings = roleEntries(state).flatMap(capabilityWarnings);
  const lines = [
    `# pi-herd brief`,
    `Run: ${state.run_id}`,
    `Goal: ${state.goal}`,
    `Status: ${state.status}`,
    "",
    "## Roles",
    ...roleEntries(state).map((role) => `- ${role.role}: ${role.status}; pane=${role.herdr_pane_id ?? "none"}; worktree=${role.worktree_status}`),
    "",
    "## Artifacts",
    ...artifacts.map((artifact) => `- ${artifact.present ? "present" : "missing"} ${artifact.role}/${artifact.name}: ${artifact.path}`),
    "",
    "## Inbox",
    ...inbox.length ? inbox.map((item) => `- ${item}`) : ["- none"],
    ...warnings.length ? ["", "## Warnings", ...warnings.map((warning) => `- ${warning}`)] : [],
    "",
    "Next: send work to staged roles, wait or collect active workers, refresh reviewer/tester between passes, or diff implementation changes."
  ];
  return { state, text: `${truncate(lines.join("\n"), 8e3)}
` };
}
async function leadCollect(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const { state } = await resolveRunState(options, runner);
  const artifacts = await artifactInventory(state);
  const inbox = await inboxInventory(state);
  const lines = [
    `Artifact inventory for ${state.run_id}`,
    ...artifacts.map((artifact) => `- ${artifact.present ? "present" : "missing"} ${artifact.role}/${artifact.name}: ${artifact.path}`),
    "Inbox:",
    ...inbox.length ? inbox.map((item) => `- ${item}`) : ["- none"]
  ];
  return { state, text: `${lines.join("\n")}
` };
}
async function ensureRolePane(options) {
  const record = options.state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for this run.`);
  }
  const notes = [];
  let launchedNow = false;
  let stalePane = false;
  if (record.herdr_pane_id) {
    const pane = await paneGet(options.runner, options.state.repo_root, record.herdr_pane_id);
    if (pane.exitCode !== 0) {
      if (pane.timedOut || pane.error || !isMissingPaneFailure(pane)) {
        throw new Error(`Could not validate ${options.role} pane ${record.herdr_pane_id}: ${describeFailure(pane, "pane get failed")}`);
      }
      notes.push(`Detected stale pane for ${options.role}; relaunching.`);
      stalePane = true;
    }
  }
  if ((options.role === "reviewer" || options.role === "tester") && record.worktree_status !== "materialized") {
    notes.push(`Activating ${options.role}: materializing worktree from ${record.source_ref ?? options.state.base_ref}.`);
    await materializeRoleWorktree({
      state: options.state,
      runner: options.runner,
      role: options.role,
      baseRef: record.source_ref,
      cleanCheckIgnorePaths: [relative3(options.state.repo_root, resolveRunsRoot(options.state.repo_root, options.config.paths.runs_dir || DEFAULT_RUNS_DIR)), ".worktrees"],
      onMaterialized: async () => {
        await updateRunState(options.statePath, (fresh) => {
          const freshRecord = fresh.roles[options.role];
          if (!freshRecord) return;
          freshRecord.worktree_path = record.worktree_path;
          freshRecord.worktree_status = record.worktree_status;
          freshRecord.worktree_provider = record.worktree_provider;
          freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id;
          freshRecord.herdr_workspace_id = record.herdr_workspace_id;
        });
      }
    });
  }
  if (!record.herdr_pane_id || stalePane) {
    if (!record.worktree_path && record.expected_writes === "worktree") {
      throw new Error(`Role ${options.role} needs a worktree before launch.`);
    }
    notes.push(`Activating ${options.role}: launching session.`);
    const launch = await launchRoleSession({
      state: options.state,
      config: options.config,
      runner: options.runner,
      role: options.role,
      cwd: record.worktree_path ?? options.state.repo_root
    });
    applyRoleLaunch(record, launch);
    launchedNow = true;
    await updateRunState(options.statePath, (fresh) => {
      const freshRecord = fresh.roles[options.role];
      if (!freshRecord) return;
      freshRecord.herdr_workspace_id = record.herdr_workspace_id;
      freshRecord.herdr_tab_id = record.herdr_tab_id;
      freshRecord.herdr_pane_id = record.herdr_pane_id;
      freshRecord.session_ref = record.session_ref;
      freshRecord.status = record.status;
      freshRecord.launch_metadata = record.launch_metadata;
      freshRecord.worktree_path = record.worktree_path;
      freshRecord.worktree_status = record.worktree_status;
      freshRecord.worktree_provider = record.worktree_provider;
      freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id;
    });
  }
  return { notes, launchedNow };
}
function isMissingPaneFailure(result) {
  const output = `${result.stderr}
${result.stdout}`.toLowerCase();
  if (/\b(unknown command|unknown flag|unrecognized|unsupported)\b/.test(output)) {
    return false;
  }
  return [
    /\bmissing\s+pane\b/,
    /\bpane\s+[^\n]*\b(missing|not found|does not exist)\b/,
    /\b(no such|not found)\s+[^\n]*\bpane\b/
  ].some((pattern) => pattern.test(output));
}
async function resolveRunState(options, runner) {
  return resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, env: options.env, runner });
}
function hasCurrentPaneEnv(env) {
  return env.HERDR_ENV === "1" && Boolean(env.HERDR_PANE_ID) && env.PI_CODING_AGENT === "true";
}
async function assertCurrentLead(state, runner, env) {
  if (!hasCurrentPaneEnv(env)) {
    throw new Error("Lead command must run from the bound Pi lead pane.");
  }
  const verified = await verifyCurrentPane2(runner, state.repo_root, env.HERDR_PANE_ID);
  if (!verified || state.lead_binding.herdr_pane_id !== env.HERDR_PANE_ID) {
    throw new Error("Lead command must run from the bound Pi lead pane for this run.");
  }
}
function roleEntries(state) {
  return Object.values(state.roles).filter(Boolean);
}
function capabilityWarnings(record) {
  const warnings = [];
  if (!record.herdr_pane_id && record.status !== "pending") {
    warnings.push(`${record.role} has no pane/session.`);
  }
  if (record.expected_writes === "worktree" && !record.worktree_path) {
    warnings.push(`${record.role} expects worktree writes but has no worktree path.`);
  }
  if (record.worktree_status === "pending" && (record.role === "reviewer" || record.role === "tester")) {
    warnings.push(`${record.role} worktree is pending until first activation.`);
  }
  return warnings;
}
async function artifactInventory(state) {
  const artifacts = [];
  for (const role of roleEntries(state)) {
    for (const name of role.required_artifacts) {
      const path = join4(state.canonical_run_dir, name);
      artifacts.push({ role: role.role, name, path, present: await exists2(path) });
    }
  }
  return artifacts;
}
async function inboxInventory(state) {
  try {
    const { readdir: readdir2 } = await import("node:fs/promises");
    return (await readdir2(join4(state.canonical_run_dir, "inbox"))).sort().slice(0, 20);
  } catch {
    return [];
  }
}
async function exists2(path) {
  try {
    await access5(path, constants5.F_OK);
    return true;
  } catch {
    return false;
  }
}
function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}
... truncated ...` : value;
}

// src/board.ts
import { join as join6 } from "node:path";

// src/status.ts
import { mkdir as mkdir3, readFile as readFile4, rename as rename2, stat as stat2, writeFile as writeFile4 } from "node:fs/promises";
import { basename as basename2, dirname as dirname4, join as join5 } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";

// src/refresh.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { access as access6 } from "node:fs/promises";
import { constants as constants6 } from "node:fs";
import { resolve as resolve5 } from "node:path";
async function refreshRole(options) {
  if (options.role !== "reviewer" && options.role !== "tester") {
    throw new Error("Refresh only supports reviewer or tester roles.");
  }
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const record = resolved.state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for run ${resolved.state.run_id}.`);
  }
  const implementationBranch = implementationBranchFor(resolved.state);
  await assertRefExists(runner, resolved.state.repo_root, implementationBranch, "implementation branch has not been created yet");
  const notes = [];
  if (record.status === "working" && !options.force) {
    throw new Error(`Refusing to refresh ${options.role} while it is working. Re-run with --force to override.`);
  }
  const expectedPath = roleWorktreePath(resolved.state.repo_root, resolved.state.run_id, options.role);
  const storedPathExists = record.worktree_path ? await exists3(record.worktree_path) : false;
  const expectedPathExists = await exists3(expectedPath);
  if (record.worktree_status !== "materialized" || !record.worktree_path || !storedPathExists) {
    if (record.worktree_status === "materialized" && record.worktree_path && !storedPathExists) {
      notes.push(`Stored ${options.role} worktree path is missing; recreating it.`);
    }
    if (expectedPathExists) {
      await assertNoSymlinkPathComponents(resolved.state.repo_root, expectedPath);
      record.worktree_path = expectedPath;
      record.worktree_status = "materialized";
      record.worktree_provider = record.worktree_provider ?? "git";
      notes.push(`Reused existing ${options.role} worktree at ${expectedPath}.`);
    } else if (await localBranchExists(runner, resolved.state.repo_root, record.branch ?? "")) {
      await assertNoSymlinkPathComponents(resolved.state.repo_root, expectedPath);
      await gitWorktreePruneStale(runner, resolved.state.repo_root);
      await gitWorktreeAddExistingBranch(runner, resolved.state.repo_root, expectedPath, record.branch);
      record.worktree_path = expectedPath;
      record.worktree_status = "materialized";
      record.worktree_provider = record.worktree_provider ?? "git";
      notes.push(`Recreated ${options.role} worktree at ${expectedPath}.`);
    } else {
      record.worktree_path = null;
      record.worktree_status = "pending";
      record.worktree_provider = null;
      record.worktree_herdr_workspace_id = null;
      await materializeRoleWorktree({
        state: resolved.state,
        runner,
        role: options.role,
        baseRef: implementationBranch,
        cleanCheckIgnorePaths: [".pi-herd/runs", ".worktrees"],
        onMaterialized: async () => {
          await updateRoleWorktreeState(resolved.statePath, resolved.state, options.role);
        }
      });
      notes.push(`Materialized ${options.role} worktree at ${record.worktree_path}.`);
    }
  }
  if (!record.worktree_path) {
    throw new Error(`Role ${options.role} has no worktree path after materialization.`);
  }
  await assertNoSymlinkPathComponents(resolved.state.repo_root, record.worktree_path);
  await assertExpectedRoleWorktree(runner, record.worktree_path, record.branch, expectedPath, options.role, resolved.state.repo_root);
  const commits = await commitsAheadOfImplementation(runner, record.worktree_path, implementationBranch);
  if (commits.count > 0 && !options.force) {
    throw new Error(`Refusing to refresh ${options.role} worktree with ${commits.count} committed change(s) not in ${implementationBranch}. Commits:
${formatBoundedLines(commits.lines)}
Re-run with --force to reset and clean it.`);
  }
  if (commits.count > 0 && options.force) {
    notes.push(`Force refreshing ${options.role} worktree with ${commits.count} committed change(s) not in ${implementationBranch}. Commits:
${formatBoundedLines(commits.lines)}`);
  }
  const dirty = await dirtyPaths(runner, record.worktree_path);
  if (dirty.length && !options.force) {
    throw new Error(`Refusing to refresh dirty ${options.role} worktree. Dirty paths:
${formatBoundedLines(dirty)}
Re-run with --force to reset and clean it.`);
  }
  if (dirty.length && options.force) {
    notes.push(`Force refreshing dirty ${options.role} worktree. Dirty paths:
${formatBoundedLines(dirty)}`);
  }
  if (options.force) {
    const backupRef = await backupRefFor(runner, record.worktree_path, options.role, resolved.state.run_id);
    await git(runner, "save reviewer/tester worktree backup ref", ["update-ref", backupRef, "HEAD"], record.worktree_path);
    notes.push(`Saved ${options.role} backup ref ${backupRef}.`);
    if (dirty.length) {
      const stashRef = await stashDirtyWorktree(runner, record.worktree_path, options.role, resolved.state.run_id);
      notes.push(`Saved ${options.role} dirty work stash ${stashRef} (refs/stash).`);
    }
  }
  await git(runner, "reset reviewer/tester worktree", ["reset", "--hard", implementationBranch], record.worktree_path);
  if (options.force) {
    await git(runner, "clean reviewer/tester worktree", ["clean", "-fd"], record.worktree_path);
  }
  const updated = await updateRunState(resolved.statePath, (fresh) => {
    const freshRecord = fresh.roles[options.role];
    if (!freshRecord) return;
    freshRecord.source_ref = implementationBranch;
    freshRecord.worktree_path = record.worktree_path;
    freshRecord.worktree_status = "materialized";
    freshRecord.worktree_provider = record.worktree_provider ?? "git";
    freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id ?? null;
    freshRecord.herdr_workspace_id = record.herdr_workspace_id;
  });
  return {
    state: updated,
    text: [`Refreshed ${options.role} from ${implementationBranch}.`, ...notes].join("\n") + "\n"
  };
}
async function diffRun(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const diff = await implementationDiff(runner, resolved.state);
  const lines = [
    `Diff for ${resolved.state.run_id}`,
    `Range: ${diff.range}`,
    "",
    "## Stat",
    ...diff.statLines.length ? diff.statLines : ["No changes."],
    "",
    "## Files",
    ...diff.nameStatusLines.length ? diff.nameStatusLines : ["No changed files."]
  ];
  return { state: resolved.state, text: `${formatBoundedLines(lines)}
` };
}
async function dirtyPaths(runner, worktreePath) {
  const result = await runner.run("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: worktreePath });
  if (result.exitCode !== 0) {
    throw new Error(`Could not check worktree status: ${firstLine2(result.stderr) || firstLine2(result.stdout) || "git status failed"}`);
  }
  return result.stdout.trim() ? result.stdout.trimEnd().split(/\r?\n/) : [];
}
async function commitsAheadOfImplementation(runner, worktreePath, implementationBranch) {
  const range = `${implementationBranch}..HEAD`;
  const countResult = await runner.run("git", ["rev-list", "--count", range], { cwd: worktreePath });
  if (countResult.exitCode !== 0) {
    throw new Error(`Could not check committed worktree changes: ${firstLine2(countResult.stderr) || firstLine2(countResult.stdout) || "git rev-list failed"}`);
  }
  const count = Number.parseInt(countResult.stdout.trim(), 10);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`Could not parse committed worktree change count: ${firstLine2(countResult.stdout) || "empty output"}`);
  }
  if (count === 0) return { count, lines: [] };
  const logResult = await runner.run("git", ["log", "--oneline", `--max-count=${OUTPUT_BUDGETS.terminalSummaryLines}`, range], { cwd: worktreePath });
  if (logResult.exitCode !== 0) {
    throw new Error(`Could not list committed worktree changes: ${firstLine2(logResult.stderr) || firstLine2(logResult.stdout) || "git log failed"}`);
  }
  return { count, lines: logResult.stdout.trim() ? logResult.stdout.trimEnd().split(/\r?\n/) : [`${count} commit(s)`] };
}
async function implementationDiff(runner, state) {
  const implementationBranch = implementationBranchFor(state);
  await assertRefExists(runner, state.repo_root, implementationBranch, "implementation branch has not been created yet");
  const range = `${state.base_ref}...${implementationBranch}`;
  const stat3 = await git(runner, "show implementation diff stat", ["diff", "--stat", range], state.repo_root);
  const names = await git(runner, "show implementation changed files", ["diff", "--name-status", range], state.repo_root);
  return {
    implementationBranch,
    range,
    statLines: stat3.stdout.trim() ? stat3.stdout.trimEnd().split(/\r?\n/) : [],
    nameStatusLines: names.stdout.trim() ? names.stdout.trimEnd().split(/\r?\n/) : []
  };
}
function implementationBranchFor(state) {
  const branch = state.roles.implementer?.branch;
  if (!branch) {
    throw new Error("Implementation branch is unavailable because the implementer role is not selected.");
  }
  return branch;
}
async function updateRoleWorktreeState(statePath, state, role) {
  const record = state.roles[role];
  await updateRunState(statePath, (fresh) => {
    const freshRecord = fresh.roles[role];
    if (!freshRecord || !record) return;
    freshRecord.worktree_path = record.worktree_path;
    freshRecord.worktree_status = record.worktree_status;
    freshRecord.worktree_provider = record.worktree_provider;
    freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id;
    freshRecord.herdr_workspace_id = record.herdr_workspace_id;
  });
}
async function assertRefExists(runner, repoRoot, ref, message) {
  const result = await runner.run("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: repoRoot });
  if (result.exitCode === 0) return;
  throw new Error(`${message}: ${ref}`);
}
async function localBranchExists(runner, repoRoot, branch) {
  if (!branch) return false;
  const result = await runner.run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repoRoot });
  return result.exitCode === 0;
}
async function gitWorktreePruneStale(runner, repoRoot) {
  await git(runner, "prune stale worktree registrations", ["worktree", "prune", "--expire", "now"], repoRoot);
}
async function gitWorktreeAddExistingBranch(runner, repoRoot, path, branch) {
  await git(runner, `recreate ${branch} worktree`, ["worktree", "add", path, branch], repoRoot);
}
async function assertExpectedRoleWorktree(runner, worktreePath, branch, expectedPath, role, repoRoot) {
  if (resolve5(worktreePath) !== resolve5(expectedPath)) {
    throw new Error(`Refusing to refresh ${role} worktree at unexpected path ${worktreePath}. Expected ${expectedPath}.`);
  }
  if (!branch) {
    throw new Error(`Refusing to refresh ${role} worktree because its role branch is unavailable.`);
  }
  const root = await git(runner, "validate reviewer/tester worktree root", ["rev-parse", "--show-toplevel"], worktreePath);
  if (resolve5(root.stdout.trim()) !== resolve5(worktreePath)) {
    throw new Error(`Refusing to refresh ${role} worktree because ${worktreePath} is not its git worktree root.`);
  }
  const repoCommonDir = await gitCommonDir(runner, repoRoot);
  const worktreeCommonDir = await gitCommonDir(runner, worktreePath);
  if (repoCommonDir !== worktreeCommonDir) {
    throw new Error(`Refusing to refresh ${role} worktree because it does not belong to the run repository.`);
  }
  const currentBranch = await git(runner, "validate reviewer/tester worktree branch", ["symbolic-ref", "--short", "HEAD"], worktreePath);
  if (currentBranch.stdout.trim() !== branch) {
    throw new Error(`Refusing to refresh ${role} worktree because it is on ${currentBranch.stdout.trim() || "detached HEAD"} instead of ${branch}.`);
  }
}
async function gitCommonDir(runner, cwd) {
  const result = await git(runner, "validate repository identity", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  return resolve5(result.stdout.trim());
}
async function stashDirtyWorktree(runner, worktreePath, role, runId) {
  await git(runner, "stash dirty reviewer/tester worktree changes", ["stash", "push", "--include-untracked", "--message", `pi-herd ${role} refresh backup ${runId}`], worktreePath);
  const result = await git(runner, "resolve reviewer/tester dirty work stash", ["rev-parse", "--verify", "refs/stash"], worktreePath);
  return result.stdout.trim();
}
async function git(runner, label, args, cwd) {
  const result = await runner.run("git", args, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`Could not ${label}: ${firstLine2(result.stderr) || firstLine2(result.stdout) || "git failed"}`);
  }
  return result;
}
async function exists3(path) {
  try {
    await access6(path, constants6.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function backupRefFor(runner, worktreePath, role, runId) {
  const head = await git(runner, "resolve reviewer/tester worktree HEAD for backup ref", ["rev-parse", "--short=12", "HEAD"], worktreePath);
  return `refs/pi-herd/backup/${role}/${runId}/${head.stdout.trim()}-${randomUUID2()}`;
}
function formatBoundedLines(lines) {
  const budget = OUTPUT_BUDGETS.terminalSummaryLines;
  if (lines.length <= budget) return lines.join("\n");
  return [...lines.slice(0, budget), `... truncated ${lines.length - budget} line(s) ...`].join("\n");
}

// src/status.ts
var DEFAULT_SIGNAL_TIMEOUT_MS = 250;
var DEFAULT_WAIT_TIMEOUT_MS = 6e4;
var DEFAULT_POLL_INTERVAL_MS = 2e3;
async function statusRun(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const snapshot = await buildSnapshot(resolved.state, runner, options.now ?? /* @__PURE__ */ new Date(), true);
  return {
    state: resolved.state,
    snapshot,
    text: options.json ? `${JSON.stringify(snapshot, null, 2)}
` : formatStatusText(snapshot),
    exitCode: 0
  };
}
async function waitRun(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS, "timeout-ms");
  const pollIntervalMs = positiveInteger(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, "poll-interval-ms");
  const sleep2 = options.sleep ?? ((ms) => new Promise((resolve6) => setTimeout(resolve6, ms)));
  const started = Date.now();
  let latestStatePath = "";
  let latestState = null;
  let latestSnapshot = null;
  while (Date.now() - started <= timeoutMs) {
    const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
    latestStatePath = resolved.statePath;
    latestState = resolved.state;
    latestSnapshot = await buildSnapshot(resolved.state, runner, options.now ?? /* @__PURE__ */ new Date(), true);
    const activeRoles = latestSnapshot.roles.filter((role) => isWaitTarget(role.stored_status));
    const resolvedRoles = activeRoles.filter((role) => role.evaluated_status === "done" || role.evaluated_status === "incomplete" || role.evaluated_status === "blocked");
    if (!activeRoles.length || resolvedRoles.length === activeRoles.length) {
      const persisted2 = await persistRoleDecisions(latestStatePath, latestState, latestSnapshot);
      const finalSnapshot = snapshotWithPersistedState(latestSnapshot, persisted2.state);
      await appendNotificationWarning(finalSnapshot, runner, persisted2.state, persisted2.transitions);
      const hasIncomplete = hasUnresolvedOrNegativeVerdict(finalSnapshot);
      return {
        state: persisted2.state,
        snapshot: finalSnapshot,
        text: options.json ? `${JSON.stringify(finalSnapshot, null, 2)}
` : formatStatusText(finalSnapshot),
        exitCode: hasIncomplete ? 3 : 0
      };
    }
    await sleep2(Math.min(pollIntervalMs, Math.max(0, timeoutMs - (Date.now() - started))));
  }
  if (!latestState || !latestSnapshot) {
    throw new Error("No status snapshot was produced.");
  }
  const persisted = latestStatePath ? await persistRoleDecisions(latestStatePath, latestState, latestSnapshot) : { state: latestState, transitions: [] };
  const timeoutSnapshot = snapshotWithPersistedState(latestSnapshot, persisted.state);
  await appendNotificationWarning(timeoutSnapshot, runner, persisted.state, persisted.transitions);
  timeoutSnapshot.warnings.push("Timed out waiting for active roles.");
  return {
    state: persisted.state,
    snapshot: timeoutSnapshot,
    text: options.json ? `${JSON.stringify(timeoutSnapshot, null, 2)}
` : `${formatStatusText(timeoutSnapshot)}Timed out waiting for active roles.
`,
    exitCode: 2
  };
}
async function collectRun(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const initialSnapshot = await buildSnapshot(resolved.state, runner, options.now ?? /* @__PURE__ */ new Date(), true);
  const persisted = await persistRoleDecisions(resolved.statePath, resolved.state, initialSnapshot);
  const logWarnings = await collectPaneLogs(persisted.state, runner);
  const snapshot = snapshotWithPersistedState(initialSnapshot, persisted.state);
  snapshot.warnings.push(...logWarnings);
  const finalSummaryPath = join5(persisted.state.canonical_run_dir, "FINAL_SUMMARY.md");
  snapshot.final_summary_path = finalSummaryPath;
  await writeTextAtomic(finalSummaryPath, formatFinalSummary(snapshot));
  const finalSnapshot = { ...snapshot, final_summary_path: finalSummaryPath };
  const hasIncomplete = hasUnresolvedOrNegativeVerdict(finalSnapshot);
  return {
    state: persisted.state,
    snapshot: finalSnapshot,
    text: options.json ? `${JSON.stringify(finalSnapshot, null, 2)}
` : `${formatStatusText(finalSnapshot)}Wrote ${finalSummaryPath}
`,
    exitCode: hasIncomplete ? 3 : 0
  };
}
async function buildSnapshot(state, runner, now, probeSignals) {
  const roles = [];
  const warnings = [];
  for (const record of roleEntries2(state)) {
    const artifacts = await artifactStatuses(state, record);
    const signalResult = probeSignals ? await readRoleSignal(runner, state, record) : { signal: signalFromStoredStatus(record.status), warnings: [] };
    const dirtyWarnings = await artifactOnlyWorktreeWarnings(runner, record);
    const verdict = currentPassVerdict(record, artifacts);
    const roleWarnings = [
      ...signalResult.warnings,
      ...dirtyWarnings,
      ...artifacts.filter((artifact) => artifact.stale).map((artifact) => `${artifact.name} is stale for the current pass`),
      ...verdictNotes(record, artifacts, verdict, signalResult.signal)
    ];
    const evaluatedStatus = evaluateRole(record, signalResult.signal, artifacts, verdict);
    roles.push({
      role: record.role,
      stored_status: record.status,
      evaluated_status: evaluatedStatus,
      signal: signalResult.signal,
      pane_id: record.herdr_pane_id,
      worktree_status: record.worktree_status,
      artifacts,
      warnings: roleWarnings,
      pass: record.pass ?? 0,
      verdict
    });
    warnings.push(...roleWarnings.map((warning) => `${record.role}: ${warning}`));
  }
  return {
    run_id: state.run_id,
    goal: state.goal,
    status: state.status,
    state_revision: state.state_revision ?? null,
    generated_at: now.toISOString(),
    roles,
    warnings
  };
}
function snapshotWithPersistedState(snapshot, state) {
  return {
    ...snapshot,
    status: state.status,
    state_revision: state.state_revision ?? null,
    roles: snapshot.roles.map((role) => ({
      ...role,
      stored_status: state.roles[role.role]?.status ?? role.stored_status
    }))
  };
}
function evaluateRole(record, signal, artifacts, verdict) {
  if (record.status === "done" || record.status === "failed" || record.status === "incomplete") return record.status;
  if (record.status === "blocked" && signal === "working") return "working";
  if (signal === "blocked") return "blocked";
  if (signal === "idle" || signal === "stopped" || signal === "done") {
    if (verdict?.verdict === "blocked") return "blocked";
    return artifacts.every((artifact) => artifact.valid) ? "done" : "incomplete";
  }
  return record.status;
}
function currentPassVerdict(record, artifacts) {
  const pass2 = record.pass ?? 0;
  if (pass2 < 1) return null;
  for (const artifact of artifacts) {
    if (artifact.verdict && artifact.verdict.pass === pass2) return artifact.verdict;
  }
  return null;
}
function verdictNotes(record, artifacts, verdict, signal) {
  const pass2 = record.pass ?? 0;
  if (pass2 < 1) return [];
  const notes = [];
  for (const artifact of artifacts) {
    if (artifact.verdict && artifact.verdict.pass !== pass2) {
      notes.push(`${artifact.name} verdict marker is for pass ${artifact.verdict.pass}; current pass is ${pass2}`);
    }
  }
  const workStopped = signal === "idle" || signal === "stopped" || signal === "done";
  if (!verdict && workStopped && artifacts.length > 0 && artifacts.every((artifact) => artifact.valid)) {
    notes.push(`no verdict marker for pass ${pass2}; completion inferred from artifact freshness`);
  }
  if (verdict?.verdict === "blocked") {
    const detail = verdict.summary ? `: ${verdict.summary}` : "";
    notes.push(workStopped ? `reported blocked for pass ${pass2}${detail}` : `blocked marker present for pass ${pass2} but the worker is still active${detail}`);
  }
  return notes;
}
async function readRoleSignal(runner, state, record) {
  if (!record.herdr_pane_id) {
    return { signal: "not-launched", warnings: [] };
  }
  const pane = await paneGet(runner, state.repo_root, record.herdr_pane_id);
  if (pane.exitCode !== 0) {
    if (isMissingPaneFailure2(pane)) {
      return { signal: "stopped", warnings: [`pane ${record.herdr_pane_id} is missing; treating as stopped`] };
    }
    return { signal: "unknown", warnings: [`could not validate pane ${record.herdr_pane_id}: ${describeFailure(pane, "pane get failed")}`] };
  }
  for (const signal of ["done", "blocked", "idle", "working"]) {
    const result = await waitAgentStatus(runner, state.repo_root, record.herdr_pane_id, signal, DEFAULT_SIGNAL_TIMEOUT_MS);
    if (result.exitCode === 0) {
      return { signal, warnings: [] };
    }
    if (isCapabilityFailure(result)) {
      return { signal: "unknown", warnings: [`activity signal unavailable: ${describeFailure(result, "wait agent-status failed")}`] };
    }
  }
  return { signal: "unknown", warnings: [] };
}
async function artifactStatuses(state, record) {
  const statuses = [];
  for (const name of record.required_artifacts) {
    const path = join5(state.canonical_run_dir, name);
    const status = { role: record.role, name, path, present: false, valid: false, stale: false, bytes: 0 };
    try {
      const [raw, fileStat] = await Promise.all([readFile4(path), stat2(path)]);
      status.present = true;
      status.bytes = raw.byteLength;
      const text = raw.toString("utf8");
      status.verdict = parseVerdictMarker(text);
      const currentPass = record.pass ?? 0;
      const explicitCurrent = currentPass >= 1 && status.verdict?.pass === currentPass;
      status.stale = explicitCurrent ? false : isArtifactStale(fileStat.mtimeMs, record.last_activity_at);
      status.valid = text.trim().length > 0 && !status.stale;
      status.preview = truncateBytes(text, OUTPUT_BUDGETS.artifactPreviewBytes);
    } catch (error) {
      if (!isNodeErrorWithCode3(error, "ENOENT")) throw error;
    }
    statuses.push(status);
  }
  return statuses;
}
async function persistRoleDecisions(statePath, observedState, snapshot) {
  const decisions = snapshot.roles.map((role) => ({
    role: role.role,
    nextStatus: role.evaluated_status,
    observedStatus: observedState.roles[role.role]?.status ?? null,
    observedLastActivityAt: observedState.roles[role.role]?.last_activity_at ?? null,
    shouldPersist: role.evaluated_status === "done" || role.evaluated_status === "incomplete" || role.evaluated_status === "blocked"
  }));
  if (!decisions.some((decision) => canApplyDecision(observedState, decision))) {
    return { state: observedState, transitions: [] };
  }
  const transitions = [];
  const state = await updateRunState(statePath, (fresh) => {
    let changed = false;
    for (const decision of decisions) {
      if (!decision.shouldPersist) continue;
      const record = fresh.roles[decision.role];
      if (!record) continue;
      if (!isMutableStatus(record.status)) continue;
      if (record.status !== decision.observedStatus) continue;
      if (record.last_activity_at !== decision.observedLastActivityAt) continue;
      if (record.status === decision.nextStatus) continue;
      record.status = decision.nextStatus;
      transitions.push({ role: decision.role, status: decision.nextStatus });
      changed = true;
    }
    return changed;
  });
  return { state, transitions };
}
async function appendNotificationWarning(snapshot, runner, state, transitions) {
  if (!transitions.length) return;
  const summary = transitions.map((transition) => `${transition.role}: ${transition.status}`).join(", ");
  const sound = transitions.some((transition) => transition.status === "blocked" || transition.status === "incomplete") ? "request" : "done";
  try {
    const result = await notificationShow(runner, state.repo_root, {
      title: `pi-herd ${state.run_id}`,
      body: `Role status updates: ${summary}`,
      sound
    });
    if (result.exitCode !== 0) {
      snapshot.warnings.push(`Could not deliver lead notification: ${describeFailure(result, "notification failed")}`);
    }
  } catch (error) {
    snapshot.warnings.push(`Could not deliver lead notification: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function collectPaneLogs(state, runner) {
  const warnings = [];
  for (const record of roleEntries2(state)) {
    if (!record.herdr_pane_id) continue;
    const result = await runner.run("herdr", ["pane", "read", record.herdr_pane_id, "--source", "recent", "--lines", String(OUTPUT_BUDGETS.paneReadLines), "--format", "text"], { cwd: state.repo_root, timeoutMs: 1e4 });
    if (result.exitCode !== 0) {
      warnings.push(`${record.role}: could not collect pane log: ${describeFailure(result, "pane read failed")}`);
      continue;
    }
    const logsDir = join5(state.canonical_run_dir, "logs");
    await mkdir3(logsDir, { recursive: true });
    const path = join5(logsDir, `${record.role}-${safeFilename(record.herdr_pane_id)}.log`);
    await writeTextAtomic(path, result.stdout);
  }
  return warnings;
}
function formatStatusText(snapshot) {
  const lines = [
    `Run ${snapshot.run_id}`,
    `Goal: ${snapshot.goal}`,
    `Status: ${snapshot.status}`,
    `State revision: ${snapshot.state_revision ?? "none"}`,
    "Roles:"
  ];
  for (const role of snapshot.roles) {
    const artifactSummary = role.artifacts.map((artifact) => `${artifact.valid ? "valid" : artifact.stale ? "stale" : artifact.present ? "invalid" : "missing"} ${artifact.name}`).join(", ");
    const passSummary = role.pass >= 1 ? `; pass=${role.pass}` : "";
    const verdictSummary = role.verdict ? `; verdict=${role.verdict.verdict}${role.verdict.summary ? ` (${role.verdict.summary})` : ""}` : "";
    lines.push(`- ${role.role}: stored=${role.stored_status}; evaluated=${role.evaluated_status}; signal=${role.signal}${passSummary}${verdictSummary}; artifacts=${artifactSummary || "none"}`);
    for (const warning of role.warnings) {
      lines.push(`  Warning: ${warning}`);
    }
  }
  if (snapshot.final_summary_path) {
    lines.push(`Final summary: ${snapshot.final_summary_path}`);
  }
  if (snapshot.warnings.length) {
    lines.push("Warnings:", ...snapshot.warnings.map((warning) => `- ${warning}`));
  }
  return `${lines.slice(0, OUTPUT_BUDGETS.terminalSummaryLines).join("\n")}
`;
}
function formatFinalSummary(snapshot) {
  const lines = [
    "# FINAL_SUMMARY",
    "",
    `Run: ${snapshot.run_id}`,
    `Goal: ${snapshot.goal}`,
    `Run status: ${snapshot.status}`,
    `State revision: ${snapshot.state_revision ?? "none"}`,
    `Generated: ${snapshot.generated_at}`,
    "",
    "## Role verdicts"
  ];
  for (const role of snapshot.roles) {
    const explicit = role.verdict ? `; explicit verdict: ${role.verdict.verdict} pass ${role.verdict.pass}${role.verdict.summary ? ` - ${role.verdict.summary}` : ""}` : "";
    lines.push(`- ${role.role}: ${role.stored_status} (signal: ${role.signal}${explicit})`);
  }
  lines.push("", "## Artifacts");
  for (const role of snapshot.roles) {
    for (const artifact of role.artifacts) {
      lines.push("", `### ${role.role}/${artifact.name}`, "", `Path: ${artifact.path}`, `Status: ${artifact.valid ? "valid" : artifact.stale ? "stale" : artifact.present ? "invalid" : "missing"}`, `Bytes: ${artifact.bytes}`);
      if (artifact.preview) {
        lines.push("", "```text", artifact.preview, "```");
      }
    }
  }
  if (snapshot.warnings.length) {
    lines.push("", "## Warnings", ...snapshot.warnings.map((warning) => `- ${warning}`));
  }
  return `${lines.join("\n")}
`;
}
async function artifactOnlyWorktreeWarnings(runner, record) {
  if (record.role !== "reviewer" && record.role !== "tester" || record.worktree_status !== "materialized" || !record.worktree_path) {
    return [];
  }
  try {
    const dirty = await dirtyPaths(runner, record.worktree_path);
    if (!dirty.length) return [];
    return [`artifact-only worktree has source changes: ${formatBoundedItems(dirty)}`];
  } catch (error) {
    return [`could not check artifact-only worktree cleanliness: ${error instanceof Error ? error.message : String(error)}`];
  }
}
function formatBoundedItems(items) {
  const budget = OUTPUT_BUDGETS.terminalSummaryLines;
  if (items.length <= budget) return items.join(", ");
  return `${items.slice(0, budget).join(", ")}, ... truncated ${items.length - budget} item(s) ...`;
}
function isArtifactStale(mtimeMs, lastActivityAt) {
  if (!lastActivityAt) return false;
  const lastActivityMs = Date.parse(lastActivityAt);
  if (Number.isNaN(lastActivityMs)) return false;
  return mtimeMs < lastActivityMs;
}
function roleEntries2(state) {
  return Object.values(state.roles).filter(Boolean);
}
function canApplyDecision(state, decision) {
  const record = state.roles[decision.role];
  return Boolean(
    decision.shouldPersist && record && isMutableStatus(record.status) && record.status === decision.observedStatus && record.last_activity_at === decision.observedLastActivityAt && record.status !== decision.nextStatus
  );
}
function hasUnresolvedOrNegativeVerdict(snapshot) {
  return snapshot.roles.some((role) => ["incomplete", "blocked", "failed", "working"].includes(role.stored_status));
}
function isWaitTarget(status) {
  return status === "working" || status === "blocked";
}
function isMutableStatus(status) {
  return status === "working" || status === "blocked";
}
function signalFromStoredStatus(status) {
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  if (status === "working") return "working";
  return "unknown";
}
function isMissingPaneFailure2(result) {
  const output = `${result.stderr}
${result.stdout}`.toLowerCase();
  if (/\b(unknown command|unknown flag|unrecognized|unsupported)\b/.test(output)) {
    return false;
  }
  return [/\bmissing\s+pane\b/, /\bpane\s+[^\n]*\b(missing|not found|does not exist)\b/, /\b(no such|not found)\s+[^\n]*\bpane\b/].some((pattern) => pattern.test(output));
}
function isCapabilityFailure(result) {
  const output = `${result.stderr}
${result.stdout}`.toLowerCase();
  return result.error?.code === "ENOENT" || /\b(unknown command|unknown flag|unrecognized|unsupported)\b/.test(output);
}
function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}
function truncateBytes(value, maxBytes) {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) return value;
  const marker = `
... truncated to ${maxBytes} bytes ...`;
  const prefixBudget = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
  let used = 0;
  let prefix = "";
  for (const codePoint of value) {
    const codePointBytes = Buffer.byteLength(codePoint, "utf8");
    if (used + codePointBytes > prefixBudget) break;
    prefix += codePoint;
    used += codePointBytes;
  }
  return `${prefix}${marker}`;
}
async function writeTextAtomic(path, value) {
  const tempPath = join5(dirname4(path), `.tmp-${process.pid}-${Date.now()}-${randomUUID3()}-${basename2(path)}`);
  await writeFile4(tempPath, value, { encoding: "utf8", flag: "wx" });
  await rename2(tempPath, path);
}
function safeFilename(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+$/, "_");
}
function isNodeErrorWithCode3(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}

// src/board.ts
var LEGACY_ROLE_ORDER = [...BUILT_IN_ROLE_ORDER];
var MAX_BOARD_LINES = 180;
var MAX_WARNINGS = 12;
async function boardRun(options) {
  const runner = options.runner ?? nodeCommandRunner;
  try {
    const status = await statusRun({ cwd: options.cwd, configPath: options.configPath, run: options.run, runner, now: options.now });
    return { text: formatBoard(status.state, status.snapshot), exitCode: 0 };
  } catch (error) {
    if (options.run || !isUnresolvedImplicitRunError(error)) {
      throw error;
    }
    const activeRuns = await listRunsForInvocation(options.cwd, options.configPath, runner, false);
    if (activeRuns.length === 0) {
      return { text: formatNoActiveBoard(), exitCode: 0 };
    }
    return { text: formatMultipleRunsBoard(activeRuns), exitCode: 0 };
  }
}
function isUnresolvedImplicitRunError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("No active runs found.") || message.startsWith("Multiple active runs found.") || message.startsWith("Current pane matches multiple active runs.");
}
function formatNoActiveBoard() {
  return [
    "# pi-herd run board",
    "",
    "No active pi-herd run was found for this project.",
    "",
    "Next actions:",
    "- Start a run: pi-herd start <goal>",
    "- List old runs: pi-herd run list --all"
  ].join("\n") + "\n";
}
function formatMultipleRunsBoard(runs) {
  return [
    "# pi-herd run board",
    "",
    "Multiple active pi-herd runs were found. Open a specific board with --run:",
    ...runs.map((run) => `- ${run.run_id} (${run.run_slug}) ${run.goal}`),
    "",
    "Next actions:",
    "- pi-herd board --run <run_id|slug>",
    "- pi-herd status --run <run_id|slug>"
  ].join("\n") + "\n";
}
function formatBoard(state, snapshot) {
  const lines = [
    "# pi-herd run board",
    "",
    `Run: ${state.run_id} (${state.run_slug})`,
    `Status: ${snapshot.status}`,
    `Goal: ${snapshot.goal}`,
    `Generated: ${snapshot.generated_at}`,
    `Run dir: ${state.canonical_run_dir}`,
    "",
    "## Lead",
    `Pane: ${state.lead_binding.herdr_pane_id ?? "none"}`,
    `Session: ${state.lead_binding.session_ref ?? "none"}`,
    `Workspace: ${state.lead_binding.herdr_workspace_id ?? "none"}`,
    "",
    "## Roles"
  ];
  for (const role of orderedRoles(state)) {
    const record = state.roles[role];
    const roleSnapshot = snapshot.roles.find((candidate) => candidate.role === role);
    lines.push(...formatRole(role, record, roleSnapshot));
  }
  const warnings = snapshot.warnings.slice(0, MAX_WARNINGS);
  lines.push("", "## Warnings");
  if (warnings.length) {
    lines.push(...warnings.map((warning) => `- ${warning}`));
    if (snapshot.warnings.length > warnings.length) {
      lines.push(`- ... ${snapshot.warnings.length - warnings.length} more warnings omitted`);
    }
  } else {
    lines.push("- none");
  }
  lines.push("", "## Durable artifacts", ...formatArtifactPaths(state, snapshot));
  lines.push("", "## Next actions", ...nextBoardActions(state, snapshot).map((action) => `- ${action}`));
  return boundedBoard(lines);
}
function formatRole(role, record, snapshot) {
  if (!record) {
    return [`- ${role}: not selected`];
  }
  const stored = snapshot?.stored_status ?? record.status;
  const evaluated = snapshot?.evaluated_status ?? record.status;
  const signal = snapshot?.signal ?? "unknown";
  const lines = [
    `- ${role}: stored=${stored}; evaluated=${evaluated}; signal=${signal}; pane=${record.herdr_pane_id ?? "none"}; session=${record.session_ref ?? "none"}; worktree=${record.worktree_status}`
  ];
  const artifacts = snapshot?.artifacts ?? [];
  if (artifacts.length) {
    for (const artifact of artifacts) {
      const status = artifact.valid ? "valid" : artifact.present ? artifact.stale ? "stale" : "invalid" : "missing";
      lines.push(`  - artifact ${artifact.name}: ${status}; ${artifact.path}`);
    }
  } else {
    for (const artifact of record.required_artifacts) {
      lines.push(`  - artifact ${artifact}: expected`);
    }
  }
  if (record.worktree_path) {
    lines.push(`  - worktree path: ${record.worktree_path}`);
  }
  return lines;
}
function formatArtifactPaths(state, snapshot) {
  const paths = /* @__PURE__ */ new Set();
  for (const role of orderedRoles(state)) {
    const record = state.roles[role];
    const roleSnapshot = snapshot.roles.find((candidate) => candidate.role === role);
    for (const artifact of roleSnapshot?.artifacts ?? []) {
      paths.add(artifact.path);
    }
    if (record && !roleSnapshot?.artifacts.length) {
      for (const name of record.required_artifacts) {
        paths.add(join6(state.canonical_run_dir, name));
      }
    }
    if (record?.worktree_path) paths.add(record.worktree_path);
  }
  if (snapshot.final_summary_path) paths.add(snapshot.final_summary_path);
  return paths.size ? Array.from(paths).map((path) => `- ${path}`) : ["- none"];
}
function orderedRoles(state) {
  const ordered = state.role_order?.length ? state.role_order : LEGACY_ROLE_ORDER;
  const roles = [...ordered];
  for (const role of Object.keys(state.roles)) {
    if (!roles.includes(role)) {
      roles.push(role);
    }
  }
  return roles;
}
function nextBoardActions(state, snapshot) {
  const runSelector = state.run_id;
  const actions = [];
  const roles = snapshot.roles;
  const hasWaitingRole = roles.some((role) => role.stored_status === "working" || role.stored_status === "blocked" || role.evaluated_status === "working" || role.evaluated_status === "blocked");
  const hasResolvedRole = roles.some((role) => role.evaluated_status === "done" || role.evaluated_status === "incomplete" || role.evaluated_status === "blocked");
  const incompleteRoles = roles.filter((role) => role.evaluated_status === "incomplete" || role.evaluated_status === "blocked");
  const implementer = state.roles.implementer;
  actions.push(`Inspect current state: pi-herd status --run ${runSelector}`);
  if (hasWaitingRole) {
    actions.push(`Wait for working roles: pi-herd wait --run ${runSelector}`);
  }
  for (const role of incompleteRoles) {
    actions.push(`Re-prompt ${role.role}: pi-herd send ${role.role} "<message>" --run ${runSelector}`);
  }
  if (implementer?.worktree_status === "materialized") {
    actions.push(`Review implementation changes: pi-herd diff --run ${runSelector}`);
  }
  if (hasResolvedRole && !hasWaitingRole) {
    actions.push(`Collect verdicts and write FINAL_SUMMARY.md: pi-herd collect --run ${runSelector}`);
  }
  if (state.status !== "active") {
    actions.push(`Report cleanup candidates: pi-herd cleanup --run ${runSelector}`);
  }
  return actions;
}
function boundedBoard(lines) {
  if (lines.length <= MAX_BOARD_LINES) {
    return `${lines.join("\n")}
`;
  }
  const head = lines.slice(0, MAX_BOARD_LINES - 2);
  head.push("", `[Board truncated to ${MAX_BOARD_LINES} lines. Run pi-herd status --run <run> for full detail.]`);
  return `${head.join("\n")}
`;
}

// src/cleanup.ts
import { access as access7, readFile as readFile5, rename as rename3, writeFile as writeFile5 } from "node:fs/promises";
import { constants as constants7 } from "node:fs";
import { randomUUID as randomUUID4 } from "node:crypto";
async function mergePlanRun(options) {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner, includeAllForExplicitRun: true });
  const snapshot = await buildSnapshot(resolved.state, runner, options.now ?? /* @__PURE__ */ new Date(), true);
  const diff = await implementationDiff(runner, resolved.state);
  const mergeDecisionPath = `${resolved.state.canonical_run_dir}/MERGE_DECISION.md`;
  const content = await formatMergeDecision(resolved.state, snapshot, diff, options.now ?? /* @__PURE__ */ new Date());
  await writeText(mergeDecisionPath, content);
  const result = {
    state: resolved.state,
    snapshot,
    mergeDecisionPath,
    text: options.json ? "" : `${formatMergePlanText(resolved.state, snapshot, mergeDecisionPath)}
`,
    exitCode: 0
  };
  if (options.json) {
    result.text = `${JSON.stringify({ run_id: resolved.state.run_id, path: mergeDecisionPath, snapshot }, null, 2)}
`;
  }
  return result;
}
async function cleanupRun(options) {
  if (options.complete && options.abandon) {
    throw new Error("Choose only one of --complete or --abandon.");
  }
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner, includeAllForExplicitRun: true });
  const snapshot = await buildSnapshot(resolved.state, runner, options.now ?? /* @__PURE__ */ new Date(), true);
  const actions = [];
  const warnings = [...snapshot.warnings];
  const mutating = Boolean(options.closePanes || options.removeWorktrees || options.complete || options.abandon);
  if (!mutating) {
    return formatCleanupResult(resolved.state, snapshot, actions, warnings, options, "report");
  }
  let state = resolved.state;
  if (options.closePanes) {
    for (const roleSnapshot of snapshot.roles) {
      if (isWorkingRole(roleSnapshot) && !options.force) {
        throw new Error(`Refusing to close working ${roleSnapshot.role} pane. Re-run with --force to override.`);
      }
    }
    for (const record of roleEntries3(resolved.state)) {
      if (!record.herdr_pane_id) continue;
      if (record.herdr_pane_id === resolved.state.lead_binding.herdr_pane_id) {
        warnings.push(`Skipped ${record.role} pane ${record.herdr_pane_id} because it matches the lead pane.`);
        continue;
      }
      const pane = await paneGet(runner, resolved.state.repo_root, record.herdr_pane_id);
      if (pane.exitCode !== 0) {
        warnings.push(`Could not verify ${record.role} pane ${record.herdr_pane_id}: ${describeFailure(pane, "pane get failed")}`);
        continue;
      }
      const closed = await paneClose(runner, resolved.state.repo_root, record.herdr_pane_id);
      if (closed.exitCode !== 0) {
        warnings.push(`Could not close ${record.role} pane ${record.herdr_pane_id}: ${describeFailure(closed, "pane close failed")}`);
        continue;
      }
      actions.push(`Closed ${record.role} pane ${record.herdr_pane_id}.`);
      state = await updateRunState(resolved.statePath, (fresh) => {
        const freshRecord = fresh.roles[record.role];
        if (!freshRecord) return;
        freshRecord.herdr_pane_id = null;
        freshRecord.herdr_tab_id = null;
        freshRecord.herdr_workspace_id = null;
        freshRecord.session_ref = null;
      });
    }
  }
  if (options.removeWorktrees) {
    for (const roleSnapshot of snapshot.roles) {
      if (isWorkingRole(roleSnapshot) && !options.force) {
        throw new Error(`Refusing to remove working ${roleSnapshot.role} worktree. Re-run with --force to override.`);
      }
    }
    for (const record of roleEntries3(resolved.state)) {
      if (record.worktree_status !== "materialized" || !record.worktree_path) continue;
      const removed = await removeRoleWorktree(resolved.state, record, runner, Boolean(options.force));
      actions.push(...removed.actions);
      warnings.push(...removed.warnings);
      if (removed.removed) {
        state = await updateRunState(resolved.statePath, (fresh) => {
          const freshRecord = fresh.roles[record.role];
          if (!freshRecord) return;
          freshRecord.worktree_path = null;
          freshRecord.worktree_status = "pending";
          freshRecord.worktree_provider = null;
          freshRecord.worktree_herdr_workspace_id = null;
        });
      }
    }
  }
  if (options.complete || options.abandon) {
    const nextStatus = options.complete ? "completed" : "abandoned";
    state = await updateRunState(resolved.statePath, (fresh) => {
      fresh.status = nextStatus;
    });
    actions.push(`Marked run ${nextStatus}.`);
  }
  const finalSnapshot = await buildSnapshot(state, runner, options.now ?? /* @__PURE__ */ new Date(), true);
  const finalWarnings = Array.from(/* @__PURE__ */ new Set([...warnings, ...finalSnapshot.warnings]));
  return formatCleanupResult(state, finalSnapshot, actions, finalWarnings, options, "applied");
}
async function removeRoleWorktree(state, record, runner, force) {
  const actions = [];
  const warnings = [];
  if (!record.worktree_path) return { actions, warnings, removed: false };
  const expectedPath = roleWorktreePath(state.repo_root, state.run_id, record.role);
  try {
    await assertNoSymlinkPathComponents(state.repo_root, record.worktree_path);
    await assertExpectedRoleWorktree(runner, record.worktree_path, record.branch, expectedPath, record.role, state.repo_root);
  } catch (error) {
    if (await exists4(record.worktree_path)) throw error;
    warnings.push(`Stored ${record.role} worktree path is missing: ${record.worktree_path}.`);
    actions.push(`Cleared missing ${record.role} worktree state.`);
    return { actions, warnings, removed: true };
  }
  const dirty = await cleanupDirtyPaths(runner, record.worktree_path);
  if (dirty.length && !force) {
    throw new Error(`Refusing to remove dirty ${record.role} worktree. Dirty paths:
${formatBoundedLines(dirty)}
Re-run with --force to preserve and remove it.`);
  }
  if (force) {
    const backupRef = await backupRefFor(runner, record.worktree_path, record.role, state.run_id);
    await git(runner, `save ${record.role} worktree cleanup backup ref`, ["update-ref", backupRef, "HEAD"], record.worktree_path);
    actions.push(`Saved ${record.role} backup ref ${backupRef}.`);
    if (dirty.length) {
      await git(runner, `stash dirty ${record.role} worktree before removal`, ["stash", "push", "--all", "--message", `pi-herd ${record.role} cleanup backup ${state.run_id}`], record.worktree_path);
      const stash = await git(runner, `resolve ${record.role} cleanup stash`, ["rev-parse", "--verify", "refs/stash"], record.worktree_path);
      actions.push(`Saved ${record.role} dirty work stash ${stash.stdout.trim()} (refs/stash).`);
    }
  }
  let removed = false;
  if (record.worktree_provider === "herdr" && record.worktree_herdr_workspace_id) {
    const result = await worktreeRemove(runner, state.repo_root, { workspaceId: record.worktree_herdr_workspace_id, force });
    if (result.exitCode === 0) {
      removed = true;
      actions.push(`Removed ${record.role} Herdr worktree workspace ${record.worktree_herdr_workspace_id}.`);
    } else {
      warnings.push(`Herdr could not remove ${record.role} worktree; falling back to git: ${describeFailure(result, "herdr worktree remove failed")}`);
    }
  }
  if (!removed) {
    try {
      await git(runner, `remove ${record.role} worktree`, ["worktree", "remove", ...force ? ["--force"] : [], record.worktree_path], state.repo_root);
      actions.push(`Removed ${record.role} git worktree ${record.worktree_path}.`);
      removed = true;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { actions, warnings, removed };
}
async function formatMergeDecision(state, snapshot, diff, now) {
  const reviewerExcerpt = await artifactExcerpt(state, "REVIEW.md");
  const testerExcerpt = await artifactExcerpt(state, "TEST_REPORT.md");
  const finalSummaryExists = await exists4(`${state.canonical_run_dir}/FINAL_SUMMARY.md`);
  const lines = [
    "# Merge Decision",
    "",
    `Generated: ${now.toISOString()}`,
    `Run: ${state.run_id}`,
    `State revision: ${state.state_revision ?? "untracked"}`,
    `Goal: ${state.goal}`,
    `Status: ${state.status}`,
    "",
    "## Source",
    "",
    `Base ref: ${state.base_ref}`,
    `Implementation branch: ${diff.implementationBranch}`,
    `Diff range: ${diff.range}`,
    `Full diff command: git diff ${diff.range}`,
    "",
    "## Diff stat",
    "",
    ...boundedMarkdownLines(diff.statLines.length ? diff.statLines : ["No changes."]),
    "",
    "## Changed files",
    "",
    ...boundedMarkdownLines(diff.nameStatusLines.length ? diff.nameStatusLines : ["No changed files."]),
    "",
    "## Role context",
    "",
    ...snapshot.roles.map((role) => `- ${role.role}: stored=${role.stored_status}; evaluated=${role.evaluated_status}; signal=${role.signal}`),
    "",
    "## Reviewer artifact excerpt",
    "",
    reviewerExcerpt,
    "",
    "## Tester artifact excerpt",
    "",
    testerExcerpt,
    "",
    "## Warnings",
    "",
    ...allWarnings(snapshot).length ? allWarnings(snapshot).map((warning) => `- ${warning}`) : ["- None."],
    "",
    "## Final summary",
    "",
    finalSummaryExists ? `${state.canonical_run_dir}/FINAL_SUMMARY.md` : "FINAL_SUMMARY.md not found. Run `pi-herd collect` before final merge review if needed.",
    "",
    "## Manual next steps",
    "",
    "1. Inspect this file, FINAL_SUMMARY.md, REVIEW.md, TEST_REPORT.md, and the implementation diff.",
    `2. If approved, merge ${diff.implementationBranch} into the intended target branch manually.`,
    "3. Run project validation in the target branch after merge.",
    "4. Run `pi-herd cleanup --complete` after the run is accepted, or `pi-herd cleanup --abandon` if it is not.",
    ""
  ];
  return `${lines.join("\n")}
`;
}
async function cleanupDirtyPaths(runner, worktreePath) {
  const result = await git(runner, "check cleanup worktree status", ["status", "--porcelain", "--untracked-files=all", "--ignored=matching"], worktreePath);
  return result.stdout.trim() ? result.stdout.trimEnd().split(/\r?\n/) : [];
}
function formatMergePlanText(state, snapshot, path) {
  const lines = [
    `Wrote ${path}`,
    `Run: ${state.run_id}`,
    `Status: ${state.status}`
  ];
  const warnings = allWarnings(snapshot);
  if (warnings.length) {
    lines.push("Warnings:", ...warnings.slice(0, OUTPUT_BUDGETS.terminalSummaryLines).map((warning) => `- ${warning}`));
  }
  return lines.join("\n");
}
function formatCleanupResult(state, snapshot, actions, warnings, options, mode) {
  const report = cleanupReport(state, snapshot, actions, warnings, mode);
  return {
    state,
    snapshot,
    actions,
    warnings,
    text: options.json ? `${JSON.stringify({ mode, run_id: state.run_id, status: state.status, actions, warnings, snapshot }, null, 2)}
` : report,
    exitCode: 0
  };
}
function cleanupReport(state, snapshot, actions, warnings, mode) {
  const lines = [
    mode === "report" ? `Cleanup report for ${state.run_id}` : `Cleanup applied for ${state.run_id}`,
    `Status: ${state.status}`,
    "",
    "## Candidates",
    `Worker panes: ${roleEntries3(state).filter((role) => role.herdr_pane_id).length}`,
    `Materialized worktrees: ${roleEntries3(state).filter((role) => role.worktree_status === "materialized" && role.worktree_path).length}`,
    "",
    "## Actions",
    ...actions.length ? actions : ["No changes made."],
    "",
    "## Warnings",
    ...warnings.length ? warnings : ["None."]
  ];
  if (mode === "report") {
    lines.push("", "Run with --close-panes, --remove-worktrees, --complete, or --abandon to apply cleanup actions.");
  }
  lines.push("");
  return lines.join("\n");
}
function isWorkingRole(role) {
  return role.stored_status === "working" || role.evaluated_status === "working" || role.signal === "working";
}
function roleEntries3(state) {
  return Object.values(state.roles).filter((role) => Boolean(role));
}
function allWarnings(snapshot) {
  return Array.from(new Set(snapshot.warnings));
}
function boundedMarkdownLines(lines) {
  const budget = OUTPUT_BUDGETS.terminalSummaryLines;
  if (lines.length <= budget) return lines;
  return [...lines.slice(0, budget), `... truncated ${lines.length - budget} line(s) ...`];
}
async function artifactExcerpt(state, name) {
  const path = `${state.canonical_run_dir}/${name}`;
  try {
    const content = await readFile5(path, "utf8");
    const trimmed = content.trim();
    if (!trimmed) return `${name} is empty.`;
    return trimmed.length > OUTPUT_BUDGETS.artifactPreviewBytes ? `${trimmed.slice(0, OUTPUT_BUDGETS.artifactPreviewBytes)}
... truncated ...` : trimmed;
  } catch {
    return `${name} not found.`;
  }
}
async function writeText(path, content) {
  const tempPath = `${path}.${process.pid}.${randomUUID4()}.tmp`;
  await writeFile5(tempPath, content, "utf8");
  await rename3(tempPath, path);
}
async function exists4(path) {
  try {
    await access7(path, constants7.F_OK);
    return true;
  } catch {
    return false;
  }
}

// src/cli.ts
var HELP = `pi-herd

Usage:
  pi-herd doctor [--json] [--config PATH]
  pi-herd init [--force] [--config PATH]
  pi-herd run create <goal> [--with-worktrees] [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]
  pi-herd run list [--all] [--json] [--config PATH]
  pi-herd start <goal> [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]
  pi-herd send <role> <message> [--run RUN] [--config PATH]
  pi-herd interrupt <role> [--run RUN] [--config PATH]
  pi-herd status [--json] [--run RUN] [--config PATH]
  pi-herd board [--run RUN] [--config PATH]
  pi-herd wait [--timeout-ms MS] [--poll-interval-ms MS] [--json] [--run RUN] [--config PATH]
  pi-herd collect [--json] [--run RUN] [--config PATH]
  pi-herd refresh <reviewer|tester> [--force] [--run RUN] [--config PATH]
  pi-herd diff [--run RUN] [--config PATH]
  pi-herd merge-plan [--json] [--run RUN] [--config PATH]
  pi-herd cleanup [--complete|--abandon] [--close-panes] [--remove-worktrees] [--force] [--json] [--run RUN] [--config PATH]
  pi-herd lead <status|brief|collect|send> [args] [--run RUN] [--config PATH]
  pi-herd --help

Commands:
  doctor     Check the local environment and pi-herd config.
  init       Create .pi-herd config, run directory, prompts, and ignore entries.
  run        Create and manage orchestration run state.
  start      Create or bind lead, launch visible sessions, and activate planner.
  send       Send a prompt to a selected role pane, activating reviewer/tester if needed.
  interrupt  Send Escape to a role pane to stop its current work.
  status     Evaluate role activity and required artifacts without writing state.
  board      Show a read-only run board optimized for a Herdr pane.
  wait       Wait for working roles to resolve and persist role verdicts.
  collect    Persist verdicts, collect pane logs, and write FINAL_SUMMARY.md.
  refresh    Refresh reviewer/tester worktrees from the implementation branch.
  diff       Show implementation branch changes against the run base ref.
  merge-plan Write MERGE_DECISION.md with manual merge context.
  cleanup    Report or apply safe run cleanup actions.
  lead       Lead-session shortcuts for status, brief, collect, and send.
`;
async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  try {
    if (argv[0] === "--") {
      argv = argv.slice(1);
    }
    const command = argv[0];
    if (!command || command === "--help" || command === "-h") {
      process.stdout.write(HELP);
      return 0;
    }
    if (command === "doctor") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          json: { type: "boolean", default: false },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd doctor [--json] [--config PATH]\n");
        return 0;
      }
      const report = await runDoctor({ cwd, configPath: values.config, runner: nodeCommandRunner });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
      } else {
        process.stdout.write(formatDoctorText(report));
      }
      return report.ok ? 0 : 1;
    }
    if (command === "init") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          force: { type: "boolean", default: false },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd init [--force] [--config PATH]\n");
        return 0;
      }
      const result = await runInit({ cwd, configPath: values.config, force: values.force });
      process.stdout.write(formatInitText(result));
      return 0;
    }
    if (command === "start") {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: {
          role: { type: "string", multiple: true },
          "base-ref": { type: "string" },
          "planner-worktree": { type: "boolean", default: false },
          json: { type: "boolean", default: false },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd start <goal> [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]\n");
        return 0;
      }
      const goal = positionals.join(" ").trim();
      const roles = values.role?.map(parseRole);
      const result = await startRun({
        cwd,
        goal,
        configPath: values.config,
        roles,
        baseRef: values["base-ref"],
        plannerWorktree: values["planner-worktree"],
        runner: nodeCommandRunner
      });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(result.state, null, 2)}
`);
      } else {
        process.stdout.write(formatStartText(result));
      }
      return 0;
    }
    if (command === "send") {
      const parsed = parseSendArgs(argv.slice(1), "pi-herd send <role> <message> [--run RUN] [--config PATH]");
      if (parsed.help) {
        process.stdout.write("Usage: pi-herd send <role> <message> [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await sendMessage({ cwd, configPath: parsed.config, run: parsed.run, role: parsed.role, message: parsed.message, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }
    if (command === "interrupt") {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd interrupt <role> [--run RUN] [--config PATH]\n");
        return 0;
      }
      if (positionals.length !== 1) {
        throw new Error("Usage: pi-herd interrupt <role> [--run RUN] [--config PATH]");
      }
      const result = await interruptRole({ cwd, configPath: values.config, run: values.run, role: parseRole(positionals[0]), runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }
    if (command === "status") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          json: { type: "boolean", default: false },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd status [--json] [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await statusRun({ cwd, configPath: values.config, run: values.run, json: values.json, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }
    if (command === "board") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd board [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await boardRun({ cwd, configPath: values.config, run: values.run, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }
    if (command === "wait") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          json: { type: "boolean", default: false },
          "timeout-ms": { type: "string" },
          "poll-interval-ms": { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd wait [--timeout-ms MS] [--poll-interval-ms MS] [--json] [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await waitRun({
        cwd,
        configPath: values.config,
        run: values.run,
        json: values.json,
        timeoutMs: values["timeout-ms"] ? Number(values["timeout-ms"]) : void 0,
        pollIntervalMs: values["poll-interval-ms"] ? Number(values["poll-interval-ms"]) : void 0,
        runner: nodeCommandRunner
      });
      process.stdout.write(result.text);
      return result.exitCode;
    }
    if (command === "collect") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          json: { type: "boolean", default: false },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd collect [--json] [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await collectRun({ cwd, configPath: values.config, run: values.run, json: values.json, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }
    if (command === "refresh") {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          force: { type: "boolean", default: false },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd refresh <reviewer|tester> [--force] [--run RUN] [--config PATH]\n");
        return 0;
      }
      if (positionals.length !== 1) {
        throw new Error("Usage: pi-herd refresh <reviewer|tester> [--force] [--run RUN] [--config PATH]");
      }
      const result = await refreshRole({ cwd, configPath: values.config, run: values.run, role: parseRole(positionals[0]), force: values.force, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }
    if (command === "diff") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd diff [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await diffRun({ cwd, configPath: values.config, run: values.run, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }
    if (command === "merge-plan") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          json: { type: "boolean", default: false },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd merge-plan [--json] [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await mergePlanRun({ cwd, configPath: values.config, run: values.run, json: values.json, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }
    if (command === "cleanup") {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          complete: { type: "boolean", default: false },
          abandon: { type: "boolean", default: false },
          "close-panes": { type: "boolean", default: false },
          "remove-worktrees": { type: "boolean", default: false },
          force: { type: "boolean", default: false },
          json: { type: "boolean", default: false },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd cleanup [--complete|--abandon] [--close-panes] [--remove-worktrees] [--force] [--json] [--run RUN] [--config PATH]\n");
        return 0;
      }
      const result = await cleanupRun({
        cwd,
        configPath: values.config,
        run: values.run,
        complete: values.complete,
        abandon: values.abandon,
        closePanes: values["close-panes"],
        removeWorktrees: values["remove-worktrees"],
        force: values.force,
        json: values.json,
        runner: nodeCommandRunner
      });
      process.stdout.write(result.text);
      return result.exitCode;
    }
    if (command === "lead") {
      const subcommand = argv[1];
      if (!subcommand || subcommand === "--help" || subcommand === "-h") {
        process.stdout.write("Usage: pi-herd lead <status|brief|collect|send> [args] [--run RUN] [--config PATH]\n");
        return 0;
      }
      if (subcommand === "send") {
        const parsed = parseSendArgs(argv.slice(2), "pi-herd lead send <role> <message> [--run RUN] [--config PATH]");
        if (parsed.help) {
          process.stdout.write("Usage: pi-herd lead send <role> <message> [--run RUN] [--config PATH]\n");
          return 0;
        }
        const result = await sendMessage({ cwd, configPath: parsed.config, run: parsed.run, role: parsed.role, message: parsed.message, requireLead: true, runner: nodeCommandRunner });
        process.stdout.write(result.text);
        return 0;
      }
      const { values } = parseArgs({
        args: argv.slice(2),
        options: {
          run: { type: "string" },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write(`Usage: pi-herd lead ${subcommand} [--run RUN] [--config PATH]
`);
        return 0;
      }
      const options = { cwd, configPath: values.config, run: values.run, runner: nodeCommandRunner };
      if (subcommand === "status") {
        process.stdout.write((await leadStatus(options)).text);
        return 0;
      }
      if (subcommand === "brief") {
        process.stdout.write((await leadBrief(options)).text);
        return 0;
      }
      if (subcommand === "collect") {
        process.stdout.write((await leadCollect(options)).text);
        return 0;
      }
      process.stderr.write(`Unknown lead command: ${subcommand}
`);
      return 1;
    }
    if (command === "run") {
      const subcommand = argv[1];
      if (!subcommand || subcommand === "--help" || subcommand === "-h") {
        process.stdout.write("Usage: pi-herd run <create|list> [args]\n");
        return 0;
      }
      if (subcommand === "list") {
        const { values: values2 } = parseArgs({
          args: argv.slice(2),
          options: {
            all: { type: "boolean", default: false },
            json: { type: "boolean", default: false },
            config: { type: "string" },
            help: { type: "boolean", short: "h", default: false }
          },
          allowPositionals: false
        });
        if (values2.help) {
          process.stdout.write("Usage: pi-herd run list [--all] [--json] [--config PATH]\n");
          return 0;
        }
        const runs = await listRunsForInvocation(cwd, values2.config, nodeCommandRunner, values2.all);
        process.stdout.write(values2.json ? `${JSON.stringify(runs, null, 2)}
` : formatRunListText(runs));
        return 0;
      }
      if (subcommand !== "create") {
        process.stderr.write(`Unknown run command: ${subcommand}
`);
        return 1;
      }
      const { values, positionals } = parseArgs({
        args: argv.slice(2),
        options: {
          role: { type: "string", multiple: true },
          "base-ref": { type: "string" },
          "with-worktrees": { type: "boolean", default: false },
          "planner-worktree": { type: "boolean", default: false },
          json: { type: "boolean", default: false },
          config: { type: "string" },
          help: { type: "boolean", short: "h", default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write("Usage: pi-herd run create <goal> [--with-worktrees] [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]\n");
        return 0;
      }
      const goal = positionals.join(" ").trim();
      const roles = values.role?.map(parseRole);
      const withWorktrees = Boolean(values["with-worktrees"] || values["planner-worktree"]);
      const result = await createRun({
        cwd,
        goal,
        configPath: values.config,
        roles,
        baseRef: values["base-ref"],
        withWorktrees,
        plannerWorktree: values["planner-worktree"],
        runner: nodeCommandRunner
      });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(result.state, null, 2)}
`);
      } else {
        process.stdout.write(formatRunCreateText(result));
      }
      return 0;
    }
    process.stderr.write(`Unknown command: ${command}

${HELP}`);
    return 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    return 1;
  }
}
function formatRunListText(runs) {
  if (!runs.length) {
    return "No runs found.\n";
  }
  const lines = ["Runs:"];
  for (const run of runs) {
    lines.push(`- ${run.run_id} (${run.status}) ${run.goal}`);
  }
  return `${lines.join("\n")}
`;
}
function parseSendArgs(args, usage) {
  let run;
  let config;
  let role;
  const messageParts = [];
  let parsingOptions = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (parsingOptions && arg === "--") {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && (arg === "--help" || arg === "-h")) {
      return { role: "planner", message: "", help: true };
    }
    if (parsingOptions && (arg === "--run" || arg === "--config")) {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.
Usage: ${usage}`);
      }
      if (arg === "--run") {
        run = value;
      } else {
        config = value;
      }
      index += 1;
      continue;
    }
    if (!role) {
      if (arg?.startsWith("-")) {
        throw new Error(`Unknown option before role: ${arg}. Use -- before dash-prefixed message text.
Usage: ${usage}`);
      }
      role = parseRole(arg ?? "");
      continue;
    }
    messageParts.push(arg ?? "");
  }
  if (!role) {
    role = parseRole("");
  }
  const message = messageParts.join(" ").trim();
  if (!message) {
    throw new Error("Message must be a non-empty string.");
  }
  return { role, message, run, config, help: false };
}
function isDirectCliEntrypoint() {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && ["cli.ts", "cli.js"].includes(basename3(entrypoint)) && import.meta.url === pathToFileURL(entrypoint).href);
}
if (isDirectCliEntrypoint()) {
  main().then((code) => {
    process.exitCode = code;
  }, (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  });
}
export {
  formatRunListText,
  main,
  parseSendArgs
};
