#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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

// ../../node_modules/.pnpm/tsup@8.5.1_postcss@8.5.9_tsx@4.21.0_typescript@5.9.3/node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl, importMetaUrl;
var init_cjs_shims = __esm({
  "../../node_modules/.pnpm/tsup@8.5.1_postcss@8.5.9_tsx@4.21.0_typescript@5.9.3/node_modules/tsup/assets/cjs_shims.js"() {
    "use strict";
    getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
    importMetaUrl = /* @__PURE__ */ getImportMetaUrl();
  }
});

// ../../node_modules/.pnpm/base64-js@1.5.1/node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "../../node_modules/.pnpm/base64-js@1.5.1/node_modules/base64-js/index.js"(exports2) {
    "use strict";
    init_cjs_shims();
    exports2.byteLength = byteLength;
    exports2.toByteArray = toByteArray;
    exports2.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }
    var i;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i2;
      for (i2 = 0; i2 < len2; i2 += 4) {
        tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i2 = start; i2 < end; i2 += 3) {
        tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// ../cli/src/bin-user-prompt-submit.ts
init_cjs_shims();

// ../cli/src/lib/hook-bootstrap.ts
init_cjs_shims();
function isSqliteLoadError(err) {
  const candidates = [err];
  if (err && typeof err === "object" && "cause" in err) {
    candidates.push(err.cause);
  }
  for (const e of candidates) {
    if (!e || typeof e !== "object") continue;
    const code = e.code;
    const message = e.message;
    const isLoadFailureCode = code === "ERR_UNKNOWN_BUILTIN_MODULE" || code === "MODULE_NOT_FOUND";
    if (isLoadFailureCode && /node:sqlite/i.test(typeof message === "string" ? message : "")) {
      return true;
    }
  }
  return false;
}
var HOOK_SQLITE_FALLBACK_MESSAGE = "teamagent hook: node:sqlite unavailable on this Node runtime (needs Node >= 22.5 spawned with --experimental-sqlite) \u2014 run `teamagent doctor` for the fix. Hook skipped.";
function handleHookUncaughtException(err) {
  if (isSqliteLoadError(err)) {
    process.stderr.write(HOOK_SQLITE_FALLBACK_MESSAGE + "\n");
    process.exit(0);
    return;
  }
  process.stderr.write(
    String(err?.stack ?? err) + "\n"
  );
  process.exit(1);
}
var armed = false;
function arm() {
  if (armed) return;
  if (process.env.VITEST) {
    armed = true;
    return;
  }
  armed = true;
  process.on("uncaughtException", handleHookUncaughtException);
}
arm();
function armHookBootstrap() {
  arm();
}

// ../cli/src/bin-user-prompt-submit.ts
var import_node_path13 = __toESM(require("path"), 1);

// ../core/src/index.ts
init_cjs_shims();

// ../core/src/scorer.ts
init_cjs_shims();

// ../core/src/static-user-skills/index.ts
init_cjs_shims();

// ../core/src/static-user-skills/types.ts
init_cjs_shims();

// ../core/src/static-user-skills/content.ts
init_cjs_shims();

// ../core/src/static-user-skills/plan.ts
init_cjs_shims();

// ../core/src/duck-mode/index.ts
init_cjs_shims();

// ../core/src/duck-mode/translations.ts
init_cjs_shims();

// ../core/src/duck-mode/is-enabled.ts
init_cjs_shims();

// ../core/src/duck-mode/duckify.ts
init_cjs_shims();

// ../core/src/compiler/markdown.ts
init_cjs_shims();
var DEFAULT_MAX_LINES = 50;
var DEFAULT_CONTENT_BUDGET = DEFAULT_MAX_LINES - 5;

// ../core/src/compiler/nested-rules.ts
init_cjs_shims();

// ../core/src/compiler/cursor.ts
init_cjs_shims();

// ../core/src/matcher/legacy/keyword-matcher.ts
init_cjs_shims();

// ../types/src/index.ts
init_cjs_shims();

// ../types/src/knowledge-entry.ts
init_cjs_shims();

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/index.js
init_cjs_shims();

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});
init_cjs_shims();

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
init_cjs_shims();

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
init_cjs_shims();

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
init_cjs_shims();

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
init_cjs_shims();
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
init_cjs_shims();
var makeIssue = (params) => {
  const { data, path: path19, errorMaps, issueData } = params;
  const fullPath = [...path19, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
init_cjs_shims();

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
init_cjs_shims();
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path19, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path19;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base642 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base642));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// ../types/src/knowledge-entry.ts
var ScopeSchema = external_exports.object({
  /** personal=只对我 / team=本项目成员 / global=所有项目 */
  level: external_exports.enum(["personal", "team", "global"]),
  /** 可选：限定到某项目 */
  project: external_exports.string().optional(),
  /** 可选：glob 路径限定 */
  paths: external_exports.array(external_exports.string()).optional(),
  /** 可选：文件类型限定 */
  file_types: external_exports.array(external_exports.string()).optional(),
  /** 可选：分支限定 */
  branches: external_exports.array(external_exports.string()).optional()
});
var DEFAULT_FIRE_THRESHOLD = 0.65;
var EvidenceSchema = external_exports.object({
  success_sessions: external_exports.number().int().nonnegative().default(0),
  success_users: external_exports.number().int().nonnegative().default(0),
  correction_sessions: external_exports.number().int().nonnegative().default(0)
});
var RULE_CHANNELS = [
  "tool-action",
  // wrong_pattern 出现在工具调用参数里 → PreToolUse 拦
  "ai-narrative",
  // wrong_pattern 是 AI 输出话术 → Stop 扫描 + 下轮注入
  "user-input",
  // wrong_pattern 是进入 AI 的外部噪声 → UserPromptSubmit 标记
  "passive-knowledge"
  // 抽象原则 → 只进 CLAUDE.md 教学，不做实时处理
];
function normalizeChannel(v) {
  if (typeof v !== "string") return "tool-action";
  return RULE_CHANNELS.includes(v) ? v : "tool-action";
}
var KnowledgeEntrySchema = external_exports.object({
  id: external_exports.string().min(1),
  scope: ScopeSchema,
  /** C=代码层 E=工程层 S=策略层 K=认知层 */
  category: external_exports.enum(["C", "E", "S", "K"]),
  /** 自由标签，系统会自动聚类 */
  tags: external_exports.array(external_exports.string()),
  /** @deprecated M4-B: all rules participate in semantic matching regardless of type */
  type: external_exports.enum(["avoidance", "practice"]),
  /** objective=客观可验证 subjective=主观偏好 */
  nature: external_exports.enum(["objective", "subjective"]),
  trigger: external_exports.string(),
  /** @deprecated M4-B: replaced by pattern_description + semantic matching */
  wrong_pattern: external_exports.string().default(""),
  correct_pattern: external_exports.string(),
  reasoning: external_exports.string(),
  /** 0.0-1.0；来源见 spec v5.2 置信度校准 */
  confidence: external_exports.number().min(0).max(1),
  /** block=≥0.9 warn=0.7-0.9 suggest=0.5-0.7 passive=<0.5 */
  enforcement: external_exports.enum(["block", "warn", "suggest", "passive"]),
  /** active=生效 conflict=与他冲突 stale=待重验 archived=已归档 dormant=休眠 */
  status: external_exports.enum(["active", "conflict", "stale", "archived", "dormant"]).default("active"),
  hit_count: external_exports.number().int().nonnegative().default(0),
  success_count: external_exports.number().int().nonnegative().default(0),
  override_count: external_exports.number().int().nonnegative().default(0),
  evidence: EvidenceSchema.default({
    success_sessions: 0,
    success_users: 0,
    correction_sessions: 0
  }),
  /** ISO 8601 */
  created_at: external_exports.string(),
  last_hit_at: external_exports.string().default(""),
  last_validated_at: external_exports.string().default(""),
  /** 来源。preset=预置元原则 / imported=从已有规则导入 / accumulated=使用中积累 / ingested=多源摄入(insights/audit/PR/git/CI) / team-shared=团队审核后共享 / internet=互联网(Phase 4) */
  source: external_exports.enum([
    "preset",
    "imported",
    "accumulated",
    "ingested",
    "team-shared",
    "internet"
  ]),
  /** 与本条冲突的其他条目 id 列表 */
  conflict_with: external_exports.array(external_exports.string()).default([]),
  /** v2 Tier system — promotion/demotion decisions */
  current_tier: external_exports.enum(["experimental", "probation", "stable", "canonical", "enforced", "dormant"]).default("experimental"),
  /** Historical max tier (selects half-life for decay) */
  max_tier_ever: external_exports.enum(["experimental", "probation", "stable", "canonical", "enforced"]).default("experimental"),
  /** Timestamp when current tier was entered (for hysteresis duration check) */
  tier_entered_at: external_exports.string().default(""),
  /** Demerit accumulation (driver's license penalty system) */
  demerit: external_exports.number().nonnegative().default(0),
  /** When demerit was last changed (for decay calculation) */
  demerit_last_updated: external_exports.string().default(""),
  /** Number of times rule was revived from dormant (3 = permanent archive) */
  resurrect_count: external_exports.number().int().nonnegative().default(0),
  /** @deprecated M4-B: replaced by unified semantic matcher */
  channel: external_exports.enum(RULE_CHANNELS).default("tool-action"),
  // M4-B 语义匹配字段（全部 optional，兼容旧数据）
  /** 触发场景的自然语言描述（用于 embedding） */
  trigger_description: external_exports.string().optional(),
  /** 错误行为的自然语言描述（用于 embedding） */
  pattern_description: external_exports.string().optional(),
  /** 规则触发阈值（固定阈值版本默认 DEFAULT_FIRE_THRESHOLD） */
  fire_threshold: external_exports.number().optional(),
  /** Thompson Beta α（Phase C 用；A+B 阶段默认 1.0） */
  threshold_alpha: external_exports.number().optional(),
  /** Thompson Beta β（Phase C 用；A+B 阶段默认 1.0） */
  threshold_beta: external_exports.number().optional(),
  /** 生成向量的 embedder 模型指纹 */
  embedder_model_id: external_exports.string().optional(),
  /** Context vectors that previously produced false positives. */
  hard_negatives: external_exports.union([external_exports.string(), external_exports.array(external_exports.array(external_exports.number()))]).optional(),
  /** Recent observations for adaptive thresholding. */
  observation_window: external_exports.union([external_exports.string(), external_exports.array(external_exports.unknown())]).optional()
});

// ../types/src/attribution.ts
init_cjs_shims();
function sanitizeUserFacingText(s) {
  if (typeof s !== "string") return "";
  let out = s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  out = out.replace(/\x9b[0-9;?]*[ -/]*[@-~]/g, "");
  out = out.replace(/\x1b\][^\x1b]*\x1b\\/g, "");
  out = out.replace(/\x1b\][^\x07]*\x07/g, "");
  out = out.replace(/\x9d[^\x9c\x07]*[\x9c\x07]/g, "");
  out = out.replace(/[\x80-\x9f]/g, "");
  out = out.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  out = out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "");
  out = out.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  return out;
}

// ../core/src/matcher/match.ts
init_cjs_shims();

// ../core/src/matcher/legacy/ast-context.ts
init_cjs_shims();
var import_node_module = require("module");
var require2 = (0, import_node_module.createRequire)(importMetaUrl);

// ../core/src/matcher/soft-and-scorer.ts
init_cjs_shims();
var DEFAULT_SOFTAND = {
  w1: 0.4,
  w2: 0.4,
  w3: 0.3,
  w4: 0.5,
  tauFloor: 0.5
};
function scoreSoftAnd(args) {
  const w = args.weights ?? DEFAULT_SOFTAND;
  const minSim = Math.min(args.triggerSim, args.patternSim);
  const floor = Math.max(0, w.tauFloor - minSim);
  const hnMax = args.hardNegativeSims.length > 0 ? Math.max(...args.hardNegativeSims) : 0;
  return w.w1 * args.triggerSim + w.w2 * args.patternSim - w.w3 * floor - w.w4 * hnMax;
}

// ../core/src/matcher/semantic-matcher.ts
init_cjs_shims();
function cosine(a, b) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
async function semanticMatch(args) {
  const embedResult = await args.embedder.embed([
    args.contextText || " ",
    args.actionText || " "
  ]);
  const ctxVec = embedResult[0] ?? [];
  const actVec = embedResult[1] ?? [];
  const candidates = await args.retriever.retrieve({
    contextText: args.contextText,
    actionText: args.actionText,
    contextVec: new Float32Array(ctxVec),
    actionVec: new Float32Array(actVec),
    scope: args.scope,
    topK: args.topK
  });
  const debug = globalThis.process?.env?.TEAMAGENT_HOOK_DEBUG === "1";
  const scored = candidates.map((c) => {
    const raw = c.rule.hard_negatives;
    const hardNegVecs = Array.isArray(raw) ? raw.filter(Array.isArray) : typeof raw === "string" && raw ? (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    })() : [];
    const hnSims = hardNegVecs.map((hn) => cosine(ctxVec, hn));
    const score = scoreSoftAnd({
      triggerSim: c.triggerSim,
      patternSim: c.patternSim,
      hardNegativeSims: hnSims
    });
    const hardNegSim = hnSims.length > 0 ? Math.max(...hnSims) : 0;
    return {
      rule: c.rule,
      score,
      triggerSim: c.triggerSim,
      patternSim: c.patternSim,
      hardNegSim
    };
  });
  if (debug) {
    const proc = globalThis.process;
    proc?.stderr?.write?.(
      `[teamagent-matcher] scope=${args.scope.level} scored ${scored.length} candidates
`
    );
    for (const m of scored.slice(0, 5)) {
      const ft = m.rule.fire_threshold ?? DEFAULT_FIRE_THRESHOLD;
      const passed = m.score > ft;
      proc?.stderr?.write?.(
        `[teamagent-matcher]   ${m.rule.id} t=${m.triggerSim.toFixed(3)} p=${m.patternSim.toFixed(3)} hn=${m.hardNegSim.toFixed(3)} score=${m.score.toFixed(3)} >${ft.toFixed(2)}? ${passed ? "PASS" : "drop"}
`
      );
    }
  }
  return scored.filter((m) => m.score > (m.rule.fire_threshold ?? DEFAULT_FIRE_THRESHOLD)).sort((a, b) => b.score - a.score);
}

// ../core/src/ranking/confidence-rank.ts
init_cjs_shims();
var TIER_FACTOR = {
  canonical: 1,
  enforced: 1,
  full: 1,
  stable: 0.9,
  probation: 0.7,
  experimental: 0.5
};
function confidenceWeight(rule) {
  if (rule.status === "archived") return 0;
  const tier = TIER_FACTOR[rule.current_tier] ?? 0.6;
  return rule.confidence * tier;
}
function rerankByConfidence(matches) {
  return matches.map((m) => ({ ...m, score: m.score * confidenceWeight(m.rule) })).sort((a, b) => b.score - a.score);
}

// ../core/src/matcher/hard-negative-accumulator.ts
init_cjs_shims();
var WINDOW_MS = 24 * 3600 * 1e3;

// ../core/src/correction-detector/rule-based.ts
init_cjs_shims();

// ../core/src/success-detector/rule-based.ts
init_cjs_shims();

// ../core/src/session-parser/index.ts
init_cjs_shims();
function extractUserText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
function extractToolResults(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b;
    if (block.type !== "tool_result") continue;
    if (typeof block.tool_use_id !== "string") continue;
    const c = String(block.content ?? "");
    out.push({
      id: block.tool_use_id,
      payload: {
        content: c,
        // B-052: added errno to catch Node.js system error objects like {"errno":-13}
        // Note: closing \b omitted because err! ends in a non-word char and would break matching.
        succeeded: !/\b(error|err!|failed|not found|exit code [1-9]|errno)/i.test(c)
      }
    });
  }
  return out;
}
function hasUserText(content) {
  return extractUserText(content).trim().length > 0;
}
function parseSessionFile(raw) {
  const messages = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  const toolResults = /* @__PURE__ */ new Map();
  for (const m of messages) {
    if (!m.message) continue;
    const blocks = m.message.content;
    for (const r of extractToolResults(blocks)) {
      toolResults.set(r.id, r.payload);
    }
  }
  const turns = [];
  let currentTurn = null;
  let sessionId = "unknown";
  const applyToolResultsToTurn = (turn, content) => {
    if (!turn) return;
    const results = extractToolResults(content);
    for (const r of results) {
      const tc = findToolCallById(turns, turn, r.id);
      if (tc) {
        tc.result = r.payload.content;
        tc.succeeded = r.payload.succeeded;
      }
    }
  };
  for (const m of messages) {
    if (m.sessionId) sessionId = m.sessionId;
    if (m.type === "user" && m.message) {
      const content = m.message.content;
      if (hasUserText(content)) {
        if (currentTurn) turns.push(currentTurn);
        currentTurn = {
          turnIndex: turns.length,
          userMessage: extractUserText(content),
          assistantText: "",
          toolCalls: [],
          timestamp: m.timestamp ?? ""
        };
      } else {
        applyToolResultsToTurn(currentTurn, content);
      }
    } else if (m.type === "assistant" && m.message) {
      if (!currentTurn) continue;
      const blocks = m.message.content;
      if (!Array.isArray(blocks)) continue;
      for (const b of blocks) {
        if (b.type === "text") {
          if (currentTurn.assistantText) currentTurn.assistantText += "\n";
          currentTurn.assistantText += b.text;
        } else if (b.type === "tool_use") {
          const tc = {
            id: b.id,
            name: b.name,
            input: b.input
          };
          const tr = toolResults.get(b.id);
          if (tr) {
            tc.result = tr.content;
            tc.succeeded = tr.succeeded;
          }
          currentTurn.toolCalls.push(tc);
        } else if (b.type === "tool_result") {
          const r = { id: b.tool_use_id, payload: toolResults.get(b.tool_use_id) };
          if (r.payload) {
            const tc = findToolCallById(turns, currentTurn, r.id);
            if (tc) {
              tc.result = r.payload.content;
              tc.succeeded = r.payload.succeeded;
            }
          }
        }
      }
    }
  }
  if (currentTurn) turns.push(currentTurn);
  return {
    sessionId,
    turns,
    startTime: turns[0]?.timestamp ?? "",
    endTime: turns[turns.length - 1]?.timestamp ?? ""
  };
}
function findToolCallById(allPriorTurns, current, id) {
  for (const tc of current.toolCalls) if (tc.id === id) return tc;
  for (let i = allPriorTurns.length - 1; i >= 0; i--) {
    const t = allPriorTurns[i];
    for (const tc of t.toolCalls) if (tc.id === id) return tc;
  }
  return void 0;
}

// ../core/src/daily-summary/index.ts
init_cjs_shims();

// ../core/src/daily-summary/cwd-decode.ts
init_cjs_shims();
function decodeProjectDirToCwd(dirName) {
  if (!dirName.startsWith("-")) {
    return dirName;
  }
  const segments = dirName.split("-");
  const joined = "/" + segments.slice(1).join("/");
  return joined.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
}

// ../core/src/daily-summary/project-key.ts
init_cjs_shims();
var WORKTREE_MARKERS = [
  "/.codex/worktrees/",
  "/.claude/worktrees/"
];
function basename(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return trimmed;
  return trimmed.slice(idx + 1) || trimmed;
}
function toProjectKey(absPath) {
  for (const marker of WORKTREE_MARKERS) {
    const idx = absPath.indexOf(marker);
    if (idx >= 0) {
      const canonical = absPath.slice(0, idx);
      return {
        canonicalCwd: canonical,
        displayName: basename(canonical),
        isWorktree: true
      };
    }
  }
  return {
    canonicalCwd: absPath,
    displayName: basename(absPath),
    isWorktree: false
  };
}

// ../core/src/daily-summary/scanner.ts
init_cjs_shims();
var nodeFs = __toESM(require("fs"), 1);
var nodePath = __toESM(require("path"), 1);
function startOfLocalDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function scanTodayActivity(opts) {
  const fs18 = opts.fs ?? nodeFs;
  const path19 = opts.path ?? nodePath;
  const nowDate = (opts.now ?? (() => /* @__PURE__ */ new Date()))();
  const windowStartMs = startOfLocalDay(nowDate).getTime();
  const windowEndMs = nowDate.getTime();
  const isoDate = toIsoDate(nowDate);
  if (!fs18.existsSync(opts.projectsRoot)) {
    return {
      date: isoDate,
      windowStartMs,
      windowEndMs,
      groups: [],
      skippedCount: 0
    };
  }
  const projectDirs = fs18.readdirSync(opts.projectsRoot);
  const groupMap = /* @__PURE__ */ new Map();
  let skipped = 0;
  for (const dir of projectDirs) {
    const projDirPath = path19.join(opts.projectsRoot, dir);
    let projStat;
    try {
      projStat = fs18.statSync(projDirPath);
    } catch {
      continue;
    }
    if (!projStat.isDirectory()) continue;
    const rawCwd = decodeProjectDirToCwd(dir);
    const projectKey2 = toProjectKey(rawCwd);
    let entries;
    try {
      entries = fs18.readdirSync(projDirPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const full = path19.join(projDirPath, entry);
      let stat;
      try {
        stat = fs18.statSync(full);
      } catch {
        continue;
      }
      if (stat.mtimeMs < windowStartMs) continue;
      let raw;
      try {
        raw = fs18.readFileSync(full, "utf-8");
      } catch {
        skipped += 1;
        continue;
      }
      let parsed;
      try {
        parsed = parseSessionFile(raw);
      } catch {
        skipped += 1;
        continue;
      }
      const sessionId = entry.replace(/\.jsonl$/, "");
      const record = {
        rawCwd,
        jsonlPath: full,
        sessionId,
        mtimeMs: stat.mtimeMs,
        session: parsed
      };
      const slot = groupMap.get(projectKey2.canonicalCwd);
      if (slot) {
        slot.records.push(record);
      } else {
        groupMap.set(projectKey2.canonicalCwd, {
          project: projectKey2,
          records: [record]
        });
      }
    }
  }
  const groups = Array.from(groupMap.values()).map(({ project, records }) => ({
    project,
    sessions: records.slice().sort((a, b) => a.mtimeMs - b.mtimeMs)
  })).sort((a, b) => a.project.canonicalCwd.localeCompare(b.project.canonicalCwd));
  return {
    date: isoDate,
    windowStartMs,
    windowEndMs,
    groups,
    skippedCount: skipped
  };
}

// ../core/src/daily-summary/aggregator.ts
init_cjs_shims();
var EXCERPT_LIMIT = 200;
function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "\u2026";
}
function firstLine(s) {
  const nl = s.indexOf("\n");
  return nl < 0 ? s : s.slice(0, nl);
}
function digestProjectGroup(group) {
  let userTurnCount = 0;
  let assistantCharCount = 0;
  let firstUser;
  let lastUser;
  let lastUserTimeMs = 0;
  let firstUserTimeMs = Number.POSITIVE_INFINITY;
  const tools = /* @__PURE__ */ new Set();
  let hadWorktreeSession = false;
  for (const rec of group.sessions) {
    if (rec.rawCwd.includes("/.codex/worktrees/") || rec.rawCwd.includes("/.claude/worktrees/")) {
      hadWorktreeSession = true;
    }
    for (const turn of rec.session.turns) {
      const trimmed = turn.userMessage.trim();
      if (trimmed.length > 0) {
        userTurnCount += 1;
        const turnTimeMs = Date.parse(turn.timestamp);
        const tsMs = Number.isNaN(turnTimeMs) ? rec.mtimeMs : turnTimeMs;
        if (tsMs < firstUserTimeMs) {
          firstUserTimeMs = tsMs;
          firstUser = trimmed;
        }
        if (tsMs >= lastUserTimeMs) {
          lastUserTimeMs = tsMs;
          lastUser = trimmed;
        }
      }
      assistantCharCount += turn.assistantText.length;
      for (const call of turn.toolCalls) {
        tools.add(call.name);
      }
    }
  }
  return {
    displayName: group.project.displayName,
    canonicalCwd: group.project.canonicalCwd,
    sessionCount: group.sessions.length,
    userTurnCount,
    assistantCharCount,
    firstUserExcerpt: firstUser ? truncate(firstLine(firstUser), EXCERPT_LIMIT) : "",
    lastUserExcerpt: lastUser ? truncate(firstLine(lastUser), EXCERPT_LIMIT) : "",
    toolsUsed: Array.from(tools).sort(),
    hadWorktreeSession
  };
}

// ../core/src/daily-summary/prompt-matcher.ts
init_cjs_shims();
var DEFAULT_TRIGGERS = [
  "\u603B\u7ED3\u4E00\u4E0B\u4ECA\u5929\u7684\u65E5\u62A5",
  "\u603B\u7ED3\u4ECA\u5929\u7684\u65E5\u62A5",
  "\u4ECA\u65E5\u65E5\u62A5",
  "\u751F\u6210\u65E5\u62A5",
  "daily summary today",
  "today's daily summary"
];
function normalize(prompt) {
  return prompt.trim();
}
function matchesSlash(prompt) {
  const t = normalize(prompt);
  if (t === "/daily") return true;
  if (t.startsWith("/daily ")) return true;
  if (t.startsWith("/daily\n")) return true;
  return false;
}
function matchesWhitelist(prompt, extra) {
  const t = normalize(prompt);
  const all = [...DEFAULT_TRIGGERS, ...extra];
  for (const phrase of all) {
    if (!phrase) continue;
    if (t.includes(phrase)) return { hit: true, phrase };
  }
  return { hit: false, phrase: "" };
}
function matchPrompt(prompt, opts) {
  if (opts?.disabled) {
    return { fire: false, reason: "disabled", matchedPhrase: "" };
  }
  if (matchesSlash(prompt)) {
    return { fire: true, reason: "slash", matchedPhrase: "/daily" };
  }
  const wl = matchesWhitelist(prompt, opts?.extraTriggers ?? []);
  if (wl.hit) {
    return { fire: true, reason: "whitelist", matchedPhrase: wl.phrase };
  }
  return { fire: false, reason: "passthrough", matchedPhrase: "" };
}
function parseExtraTriggersEnv(raw) {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// ../core/src/daily-summary/rewriter.ts
init_cjs_shims();
var META_INSTRUCTION_HEADER = `TeamAgent daily-summary trigger fired. Below is the LLM-free aggregate of the operator's Claude Code activity for today. Please respond with a one-line summary per project, in \u4E2D\u6587, first-person voice (\u4F8B\u5982 "\u4FEE\u4E86\u2026" / "\u8C03\u4E86\u2026"). Do not re-list the raw counts; paraphrase what the operator likely accomplished.`;
var ZERO_ACTIVITY_BODY = 'TeamAgent daily-summary trigger fired, but no Claude Code session activity is recorded for the operator today. Please respond briefly in \u4E2D\u6587 acknowledging "\u4ECA\u65E5\u65E0 Claude \u6D3B\u52A8".';
function formatDigest(d) {
  const lines = [];
  lines.push(`### ${d.displayName}  (${d.canonicalCwd})`);
  lines.push(
    `- sessions: ${d.sessionCount}` + (d.hadWorktreeSession ? " (\u542B worktree)" : "")
  );
  lines.push(`- user turns: ${d.userTurnCount}`);
  lines.push(`- assistant chars: ${d.assistantCharCount}`);
  if (d.toolsUsed.length > 0) {
    lines.push(`- tools: ${d.toolsUsed.join(", ")}`);
  }
  if (d.firstUserExcerpt) {
    lines.push(`- first user turn: ${d.firstUserExcerpt}`);
  }
  if (d.lastUserExcerpt && d.lastUserExcerpt !== d.firstUserExcerpt) {
    lines.push(`- last user turn: ${d.lastUserExcerpt}`);
  }
  return lines.join("\n");
}
function composeAdditionalContext(input) {
  if (input.digests.length === 0) {
    return [
      `# TeamAgent daily summary (${input.date})`,
      "",
      ZERO_ACTIVITY_BODY
    ].join("\n");
  }
  const sections = input.digests.map(formatDigest).join("\n\n");
  return [
    `# TeamAgent daily summary (${input.date})`,
    "",
    META_INSTRUCTION_HEADER,
    "",
    sections
  ].join("\n");
}
function composeArchiveMarkdown(input) {
  const headerLines = [
    `# Daily activity \u2014 ${input.date}`,
    "",
    `_Generated by TeamAgent daily-summary hook (issue #371). LLM-free aggregation of \`~/.claude/projects/\` session logs._`,
    ""
  ];
  if (input.matcherReason) {
    headerLines.push(`_Triggered by: ${input.matcherReason}_`, "");
  }
  if (input.digests.length === 0) {
    headerLines.push("_(no Claude Code activity recorded for today)_");
    headerLines.push("");
    return headerLines.join("\n");
  }
  const sections = input.digests.map(formatDigest).join("\n\n");
  return [...headerLines, sections, ""].join("\n");
}

// ../core/src/extractor/prompt.ts
init_cjs_shims();

// ../core/src/importer/claude-md-parser.ts
init_cjs_shims();

// ../core/src/importer/cursor-rules-parser.ts
init_cjs_shims();

// ../core/src/importer/rule-structurer.ts
init_cjs_shims();

// ../core/src/extractor/llm-based.ts
init_cjs_shims();

// ../core/src/detect-stack/index.ts
init_cjs_shims();
function detectStack(fs18) {
  const languages = /* @__PURE__ */ new Set();
  const frameworks = /* @__PURE__ */ new Set();
  const pms = /* @__PURE__ */ new Set();
  const testRunners = /* @__PURE__ */ new Set();
  const other = /* @__PURE__ */ new Set();
  const raw = {};
  const note = (bucket, signal) => {
    if (!raw[bucket]) raw[bucket] = [];
    raw[bucket].push(signal);
  };
  if (fs18.exists("pnpm-lock.yaml")) {
    pms.add("pnpm");
    note("packageManagers", "pnpm-lock.yaml");
  }
  if (fs18.exists("yarn.lock")) {
    pms.add("yarn");
    note("packageManagers", "yarn.lock");
  }
  if (fs18.exists("package-lock.json")) {
    pms.add("npm");
    note("packageManagers", "package-lock.json");
  }
  if (fs18.exists("bun.lockb") || fs18.exists("bun.lock")) {
    pms.add("bun");
    note("packageManagers", "bun.lock*");
  }
  const pkgJson = fs18.read("package.json");
  if (fs18.exists("package.json")) {
    languages.add("javascript");
    note("languages", "package.json");
    if (fs18.exists("tsconfig.json") || fs18.exists("tsconfig.base.json")) {
      languages.add("typescript");
      note("languages", "tsconfig.json");
    }
    if (pkgJson) {
      const deps = extractDeps(pkgJson);
      const has = (name) => deps.includes(name);
      if (has("react")) frameworks.add("react");
      if (has("vue")) frameworks.add("vue");
      if (has("svelte")) frameworks.add("svelte");
      if (has("next")) frameworks.add("next");
      if (has("nuxt")) frameworks.add("nuxt");
      if (has("astro")) frameworks.add("astro");
      if (has("express")) frameworks.add("express");
      if (has("fastify")) frameworks.add("fastify");
      if (has("@nestjs/core")) frameworks.add("nestjs");
      if (has("vitest")) testRunners.add("vitest");
      if (has("jest")) testRunners.add("jest");
      if (has("mocha")) testRunners.add("mocha");
      if (has("playwright") || has("@playwright/test")) testRunners.add("playwright");
      if (has("cypress")) testRunners.add("cypress");
      for (const f of frameworks) note("frameworks", `package.json \u2192 ${f}`);
      for (const t of testRunners) note("testRunners", `package.json \u2192 ${t}`);
    }
  }
  if (fs18.exists("pnpm-workspace.yaml")) {
    other.add("monorepo");
    note("otherSignals", "pnpm-workspace.yaml");
  } else if (pkgJson && /"workspaces"\s*:/.test(pkgJson)) {
    other.add("monorepo");
    note("otherSignals", "package.json workspaces");
  }
  if (fs18.exists("pyproject.toml")) {
    languages.add("python");
    note("languages", "pyproject.toml");
    const py = fs18.read("pyproject.toml") ?? "";
    if (/poetry/.test(py)) pms.add("poetry");
    if (/\[tool\.uv\]/.test(py) || fs18.exists("uv.lock")) pms.add("uv");
    if (/pytest/.test(py)) testRunners.add("pytest");
    if (/django/.test(py)) frameworks.add("django");
    if (/fastapi/.test(py)) frameworks.add("fastapi");
    if (/flask/.test(py)) frameworks.add("flask");
  }
  if (fs18.exists("requirements.txt")) {
    languages.add("python");
    note("languages", "requirements.txt");
  }
  if (fs18.exists("Pipfile")) {
    languages.add("python");
    pms.add("pipenv");
    note("languages", "Pipfile");
  }
  if (fs18.exists("go.mod")) {
    languages.add("go");
    note("languages", "go.mod");
  }
  if (fs18.exists("Cargo.toml")) {
    languages.add("rust");
    pms.add("cargo");
    note("languages", "Cargo.toml");
  }
  if (fs18.exists("pom.xml")) {
    languages.add("java");
    pms.add("maven");
    note("languages", "pom.xml");
  }
  if (fs18.exists("build.gradle") || fs18.exists("build.gradle.kts")) {
    languages.add("java");
    if (fs18.exists("build.gradle.kts")) languages.add("kotlin");
    pms.add("gradle");
    note("languages", "build.gradle");
  }
  if (fs18.exists("Dockerfile") || fs18.exists("docker-compose.yml")) {
    other.add("docker");
    note("otherSignals", "Dockerfile/compose");
  }
  if (fs18.exists(".github/workflows")) {
    other.add("github-actions");
    note("otherSignals", ".github/workflows");
  }
  if (fs18.exists("CLAUDE.md")) {
    other.add("claude-code");
    note("otherSignals", "CLAUDE.md");
  }
  if (fs18.exists(".cursorrules") || fs18.exists(".cursor/rules")) {
    other.add("cursor");
    note("otherSignals", ".cursorrules");
  }
  return {
    languages: [...languages].sort(),
    frameworks: [...frameworks].sort(),
    packageManagers: [...pms].sort(),
    testRunners: [...testRunners].sort(),
    otherSignals: [...other].sort(),
    raw
  };
}
function extractDeps(pkgJson) {
  try {
    const obj = JSON.parse(pkgJson);
    const names = /* @__PURE__ */ new Set();
    for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
      const section = obj[key];
      if (section && typeof section === "object") {
        for (const name of Object.keys(section)) names.add(name);
      }
    }
    return [...names];
  } catch {
    return [];
  }
}

// ../core/src/init/meta-principles.ts
init_cjs_shims();

// ../core/src/init/default-plugins.ts
init_cjs_shims();

// ../core/src/calibrator/default.ts
init_cjs_shims();

// ../core/src/pipeline/calibration-pipeline.ts
init_cjs_shims();

// ../core/src/scenario/runner.ts
init_cjs_shims();

// ../core/src/pipeline/extract-pipeline.ts
init_cjs_shims();
var import_node_crypto = require("crypto");

// ../core/src/pipeline/semantic-descriptions.ts
init_cjs_shims();

// ../core/src/calibrator/v2/index.ts
init_cjs_shims();

// ../core/src/calibrator/v2/wilson.ts
init_cjs_shims();
var DAY_MS = 24 * 3600 * 1e3;

// ../core/src/calibrator/v2/demerit.ts
init_cjs_shims();
var DAY_MS2 = 24 * 3600 * 1e3;

// ../core/src/calibrator/v2/tier.ts
init_cjs_shims();

// ../core/src/calibrator/v2/hysteresis.ts
init_cjs_shims();
var DAY_MS3 = 24 * 3600 * 1e3;

// ../core/src/pipeline/calibration-pipeline-v2.ts
init_cjs_shims();

// ../core/src/pipeline/ingest-pipeline.ts
init_cjs_shims();

// ../core/src/validator/index.ts
init_cjs_shims();

// ../core/src/validator/l0.ts
init_cjs_shims();

// ../core/src/validator/l1.ts
init_cjs_shims();

// ../core/src/validator/l2.ts
init_cjs_shims();

// ../core/src/compiler/agent-skill.ts
init_cjs_shims();

// ../core/src/pipeline/compile-pipeline.ts
init_cjs_shims();

// ../core/src/pipeline/override-signal.ts
init_cjs_shims();

// ../core/src/error-collector/cross-session-cluster.ts
init_cjs_shims();

// ../core/src/error-collector/signal-filter.ts
init_cjs_shims();

// ../core/src/pii/redactor.ts
init_cjs_shims();

// ../core/src/error-collector/error-batch-builder.ts
init_cjs_shims();

// ../core/src/error-collector/error-extraction-prompt.ts
init_cjs_shims();

// ../core/src/update/update-state.ts
init_cjs_shims();

// ../core/src/update/should-check.ts
init_cjs_shims();
var FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1e3;

// ../core/src/update/pr-creator-match.ts
init_cjs_shims();

// ../core/src/update/snooze.ts
init_cjs_shims();
var SNOOZE_DURATIONS_MS = [
  24 * 60 * 60 * 1e3,
  // level 0 → 1: 24h
  48 * 60 * 60 * 1e3,
  // level 1 → 2: 48h
  7 * 24 * 60 * 60 * 1e3
  // level 2 → 3+: 7d (cap)
];

// ../core/src/update/changelog-parser.ts
init_cjs_shims();

// ../core/src/update/prompt-text.ts
init_cjs_shims();

// ../core/src/update/upgrade-events.ts
init_cjs_shims();

// ../core/src/narrative-scanner/index.ts
init_cjs_shims();

// ../core/src/narrative-scanner/scan.ts
init_cjs_shims();
var MIN_ASCII_TOKEN_LENGTH = 3;
var MIN_CJK_TOKEN_LENGTH = 2;
function splitPatterns(raw) {
  const tokens = [];
  for (const piece of raw.split("|")) {
    const t = piece.trim();
    if (t.length === 0) continue;
    const hasNonAscii = /[^\x00-\x7f]/.test(t);
    const min = hasNonAscii ? MIN_CJK_TOKEN_LENGTH : MIN_ASCII_TOKEN_LENGTH;
    if (t.length >= min) tokens.push(t);
  }
  return tokens;
}
function containsNonExtending(textLower, patternLower) {
  const lastChar = patternLower[patternLower.length - 1] ?? "";
  if (!isLetterOrDigit(lastChar)) {
    return textLower.includes(patternLower);
  }
  let offset = textLower.indexOf(patternLower);
  while (offset !== -1) {
    const afterIdx = offset + patternLower.length;
    const afterChar = afterIdx < textLower.length ? textLower[afterIdx] : "";
    if (!isLetterOrDigit(afterChar)) return true;
    offset = textLower.indexOf(patternLower, offset + 1);
  }
  return false;
}
function isLetterOrDigit(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 97 && code <= 122 || // a-z
  code >= 65 && code <= 90 || // A-Z
  code >= 48 && code <= 57;
}
function snippet(haystack, needle, pad = 20) {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle;
  const start = Math.max(0, idx - pad);
  const end = Math.min(haystack.length, idx + needle.length + pad);
  return haystack.slice(start, end);
}
function summarize(rule) {
  return rule.correct_pattern || rule.reasoning || rule.wrong_pattern || rule.id;
}
function scanNarrative(text, rules) {
  if (!text) return [];
  if (rules.length === 0) return [];
  const hits = [];
  const lower = text.toLowerCase();
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (!rule.wrong_pattern) continue;
    if (normalizeChannel(rule.channel) !== "ai-narrative") continue;
    const patterns = splitPatterns(rule.wrong_pattern);
    for (const p of patterns) {
      if (p.length === 0) continue;
      if (containsNonExtending(lower, p.toLowerCase())) {
        hits.push({
          knowledge_id: rule.id,
          matched_snippet: snippet(text, p),
          rule_summary: summarize(rule),
          confidence: rule.confidence,
          correct_pattern: rule.correct_pattern,
          reasoning: rule.reasoning
        });
        break;
      }
    }
  }
  return hits;
}

// ../core/src/narrative-scanner/pending-warnings.ts
init_cjs_shims();
function selectTopForInjection(pending, max) {
  return [...pending].sort((a, b) => b.confidence - a.confidence).slice(0, max);
}
function formatInjectionText(warnings) {
  if (warnings.length === 0) return "";
  const lines = [
    "\u25C8 TeamAgent observation from previous turn",
    "In your previous reply the following patterns triggered team rules:"
  ];
  for (const w of warnings) {
    const hint = w.correct_pattern || w.reasoning || w.rule_summary;
    lines.push(
      `- "${w.matched_snippet.trim()}" (rule ${w.knowledge_id}, conf ${w.confidence.toFixed(2)}): ${hint}`
    );
  }
  lines.push("Please avoid such phrasing this turn and proceed based on evidence.");
  return lines.join("\n");
}

// ../core/src/hook/pre-tool-use-handler.ts
init_cjs_shims();
var RULE_BOX_WIDTH = 72;
var RULE_BOX_INNER_WIDTH = RULE_BOX_WIDTH - 4;

// ../core/src/hook/post-tool-use-handler.ts
init_cjs_shims();

// ../core/src/m5/manifest.ts
init_cjs_shims();

// ../core/src/m5/infect-planner.ts
init_cjs_shims();

// ../core/src/m5/bootstrap-diff.ts
init_cjs_shims();

// ../core/src/m5/secret-scanner.ts
init_cjs_shims();

// ../core/src/m5/scope-classifier.ts
init_cjs_shims();

// ../core/src/m5/auto-share-pipeline.ts
init_cjs_shims();

// ../core/src/m5/team-rule.ts
init_cjs_shims();

// ../core/src/m5/lww-merge.ts
init_cjs_shims();

// ../core/src/m5/team-rule-projection.ts
init_cjs_shims();

// ../core/src/packs/index.ts
init_cjs_shims();
var PROMPT_VERSION = 1;
var PROMPT_OPEN_MARKER = `<!-- teamagent-pack-prompt v${PROMPT_VERSION} -->`;
var PROMPT_CLOSE_MARKER = `<!-- /teamagent-pack-prompt v${PROMPT_VERSION} -->`;
var PackMetaSchema = external_exports.object({
  name: external_exports.string().min(1),
  description: external_exports.string(),
  tags: external_exports.array(external_exports.string()),
  file_hints: external_exports.array(external_exports.string()),
  prompt_version: external_exports.literal(PROMPT_VERSION)
});

// ../core/src/presence/index.ts
init_cjs_shims();

// ../core/src/presence/state-machine.ts
init_cjs_shims();
var DEFAULT_PRESENCE_CONFIG = {
  activeTtlMs: 10 * 60 * 1e3,
  idleAfterMs: 10 * 60 * 1e3,
  offlineAfterMs: 60 * 60 * 1e3
};

// ../cli/src/commands/daily.ts
init_cjs_shims();
var import_node_os = __toESM(require("os"), 1);
var import_node_path = __toESM(require("path"), 1);
var import_node_fs = __toESM(require("fs"), 1);
function buildDailyResult(opts = {}) {
  const home = opts.homeDir ?? import_node_os.default.homedir();
  const projectsRoot = opts.projectsRoot ?? import_node_path.default.join(home, ".claude", "projects");
  const scan = scanTodayActivity({ projectsRoot });
  const digests = scan.groups.map(digestProjectGroup);
  const worktreeMergedCount = digests.filter((d) => d.hadWorktreeSession).length;
  return {
    date: scan.date,
    windowStartMs: scan.windowStartMs,
    windowEndMs: scan.windowEndMs,
    projects: digests,
    worktreeMergedCount,
    skippedSessionCount: scan.skippedCount,
    triggeredBy: "cli"
  };
}
function executeDaily(opts = {}) {
  const result = buildDailyResult(opts);
  const json = JSON.stringify(result, null, 2) + "\n";
  const matcherReason = opts.triggeredBy ?? "cli";
  const contextMarkdown = composeAdditionalContext({
    date: result.date,
    digests: result.projects,
    matcherReason
  });
  const archiveMarkdown = composeArchiveMarkdown({
    date: result.date,
    digests: result.projects,
    matcherReason
  });
  const homeDir = opts.homeDir ?? import_node_os.default.homedir();
  const teamagentRoot = process.env["TEAMAGENT_HOME"] ?? import_node_path.default.join(homeDir, ".teamagent");
  const archivePath = import_node_path.default.join(teamagentRoot, "daily", `${result.date}.md`);
  if (opts.archive) {
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(archivePath), { recursive: true });
    const tmpPath = `${archivePath}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    import_node_fs.default.writeFileSync(tmpPath, archiveMarkdown, "utf-8");
    import_node_fs.default.renameSync(tmpPath, archivePath);
    const out = {
      result: { ...result, archivedPath: archivePath },
      json: JSON.stringify({ ...result, archivedPath: archivePath }, null, 2) + "\n",
      contextMarkdown,
      archiveMarkdown,
      archivePath
    };
    return out;
  }
  return {
    result,
    json,
    contextMarkdown,
    archiveMarkdown,
    archivePath
  };
}

// ../cli/src/user-prompt-inject.ts
init_cjs_shims();
var import_node_fs2 = __toESM(require("fs"), 1);
var import_node_path2 = __toESM(require("path"), 1);
function pendingFile(dir, sessionId) {
  return import_node_path2.default.join(dir, `${sessionId}_pending_warnings.json`);
}
function lastInjectedFile(dir, sessionId) {
  return import_node_path2.default.join(dir, `${sessionId}_last_injected.json`);
}
function buildInjectionFromPending(args) {
  const max = args.maxWarnings ?? 3;
  const file = pendingFile(args.sessionsDir, args.sessionId);
  if (!import_node_fs2.default.existsSync(file)) return { text: "", injectedIds: [] };
  let pending = [];
  try {
    const parsed = JSON.parse(import_node_fs2.default.readFileSync(file, "utf8"));
    if (Array.isArray(parsed)) pending = parsed;
  } catch {
    pending = [];
  }
  if (pending.length === 0) return { text: "", injectedIds: [] };
  const top = selectTopForInjection(pending, max);
  const text = formatInjectionText(top);
  try {
    import_node_fs2.default.writeFileSync(file, JSON.stringify([], null, 2));
  } catch {
  }
  const ids = top.map((p) => p.knowledge_id);
  return { text, injectedIds: ids };
}
function persistLastInjected(sessionsDir, sessionId, ids) {
  if (ids.length === 0) return;
  try {
    import_node_fs2.default.mkdirSync(sessionsDir, { recursive: true });
    import_node_fs2.default.writeFileSync(lastInjectedFile(sessionsDir, sessionId), JSON.stringify(ids));
  } catch {
  }
}
function scanUserInput(userText, rules) {
  const retagged = rules.filter((r) => normalizeChannel(r.channel) === "user-input").map((r) => ({ ...r, channel: "ai-narrative" }));
  return scanNarrative(userText, retagged);
}
function formatUserInputFlag(hits) {
  if (hits.length === 0) return "";
  const lines = [
    "\u25C8 TeamAgent user-input flag",
    "The following tokens in the user prompt are automation noise \u2014 treat as noise, not intent:"
  ];
  for (const h of hits) {
    lines.push(`- "${h.matched_snippet.trim()}" (rule ${h.knowledge_id})`);
  }
  return lines.join("\n");
}

// ../cli/src/user-prompt-rule-retriever.ts
init_cjs_shims();
var import_node_fs10 = __toESM(require("fs"), 1);
var import_node_path8 = __toESM(require("path"), 1);

// ../adapters/src/index.ts
init_cjs_shims();

// ../adapters/src/storage/sqlite/sqlite-knowledge-store.ts
init_cjs_shims();

// ../adapters/src/storage/sqlite/vec-sync.ts
init_cjs_shims();
function syncRuleVectors(db, ruleId, triggerVec, patternVec) {
  db.prepare("DELETE FROM knowledge_trigger_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_trigger_vec(id, vec) VALUES (?, ?)"
  ).run(ruleId, new Uint8Array(triggerVec.buffer));
  db.prepare("DELETE FROM knowledge_pattern_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_pattern_vec(id, vec) VALUES (?, ?)"
  ).run(ruleId, new Uint8Array(patternVec.buffer));
}
function syncToolVector(db, ruleId, vec) {
  db.prepare("DELETE FROM knowledge_tool_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_tool_vec(id, vec) VALUES (?, ?)"
  ).run(ruleId, new Uint8Array(vec.buffer));
}

// ../adapters/src/storage/sqlite/sqlite-knowledge-store.ts
function serializeEntry(entry) {
  const e = entry;
  const toJson = (value) => {
    if (value == null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  };
  return {
    id: entry.id,
    scope_level: entry.scope.level,
    scope_project: entry.scope.project ?? null,
    scope_paths: entry.scope.paths ? JSON.stringify(entry.scope.paths) : null,
    scope_file_types: entry.scope.file_types ? JSON.stringify(entry.scope.file_types) : null,
    scope_branches: entry.scope.branches ? JSON.stringify(entry.scope.branches) : null,
    category: entry.category,
    tags: JSON.stringify(entry.tags),
    type: entry.type,
    nature: entry.nature,
    trigger: entry.trigger,
    wrong_pattern: entry.wrong_pattern,
    correct_pattern: entry.correct_pattern,
    correct_pattern_code_example: e.correct_pattern_code_example ?? null,
    correct_pattern_import_path: e.correct_pattern_import_path ?? null,
    correct_pattern_tldr: e.correct_pattern_tldr ?? null,
    reasoning: entry.reasoning,
    when_expression: e.when_expression ?? null,
    confidence: entry.confidence,
    demerit: e.demerit ?? 0,
    demerit_last_updated: e.demerit_last_updated ?? null,
    current_tier: e.current_tier ?? "experimental",
    max_tier_ever: e.max_tier_ever ?? "experimental",
    tier_entered_at: e.tier_entered_at && e.tier_entered_at.length > 0 ? e.tier_entered_at : entry.created_at,
    enforcement: entry.enforcement,
    status: entry.status,
    hit_count: entry.hit_count,
    success_count: entry.success_count,
    override_count: entry.override_count,
    resurrect_count: e.resurrect_count ?? 0,
    evidence: JSON.stringify(entry.evidence),
    source: entry.source,
    conflict_with: JSON.stringify(entry.conflict_with),
    created_at: entry.created_at,
    last_hit_at: entry.last_hit_at || null,
    last_validated_at: entry.last_validated_at || null,
    channel: normalizeChannel(entry.channel),
    // v6 semantic matching fields
    trigger_description: e.trigger_description ?? null,
    pattern_description: e.pattern_description ?? null,
    hard_negatives: toJson(e.hard_negatives),
    threshold_alpha: e.threshold_alpha ?? null,
    threshold_beta: e.threshold_beta ?? null,
    fire_threshold: e.fire_threshold ?? null,
    observation_window: toJson(e.observation_window),
    embedder_model_id: e.embedder_model_id ?? null
  };
}
function deserializeRow(row) {
  const scope = {
    level: row.scope_level,
    ...row.scope_project != null ? { project: row.scope_project } : {},
    ...row.scope_paths != null ? { paths: JSON.parse(row.scope_paths) } : {},
    ...row.scope_file_types != null ? { file_types: JSON.parse(row.scope_file_types) } : {},
    ...row.scope_branches != null ? { branches: JSON.parse(row.scope_branches) } : {}
  };
  return {
    id: row.id,
    scope,
    category: row.category,
    tags: row.tags ? JSON.parse(row.tags) : [],
    type: row.type,
    nature: row.nature,
    trigger: row.trigger,
    wrong_pattern: row.wrong_pattern ?? "",
    correct_pattern: row.correct_pattern,
    reasoning: row.reasoning ?? "",
    confidence: row.confidence,
    current_tier: row.current_tier ?? "experimental",
    max_tier_ever: row.max_tier_ever ?? "experimental",
    tier_entered_at: row.tier_entered_at ?? "",
    demerit: row.demerit ?? 0,
    demerit_last_updated: row.demerit_last_updated ?? "",
    resurrect_count: row.resurrect_count ?? 0,
    enforcement: row.enforcement,
    status: row.status,
    hit_count: row.hit_count,
    success_count: row.success_count,
    override_count: row.override_count,
    evidence: row.evidence ? JSON.parse(row.evidence) : { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: row.created_at,
    last_hit_at: row.last_hit_at ?? "",
    last_validated_at: row.last_validated_at ?? "",
    source: row.source,
    conflict_with: row.conflict_with ? JSON.parse(row.conflict_with) : [],
    channel: normalizeChannel(row.channel),
    // v6 semantic matching fields (default-safe for old rows)
    trigger_description: row.trigger_description ?? "",
    pattern_description: row.pattern_description ?? "",
    fire_threshold: row.fire_threshold ?? DEFAULT_FIRE_THRESHOLD,
    threshold_alpha: row.threshold_alpha ?? 1,
    threshold_beta: row.threshold_beta ?? 1,
    embedder_model_id: row.embedder_model_id ?? "",
    hard_negatives: (() => {
      const v = row.hard_negatives;
      if (!v) return [];
      const s = typeof v === "string" ? v : Buffer.from(v).toString("utf8");
      try {
        return JSON.parse(s);
      } catch {
        return [];
      }
    })(),
    observation_window: (() => {
      const v = row.observation_window;
      if (!v) return [];
      const s = typeof v === "string" ? v : Buffer.from(v).toString("utf8");
      try {
        return JSON.parse(s);
      } catch {
        return [];
      }
    })()
  };
}
var INSERT_SQL = `
INSERT INTO knowledge (
  id, scope_level, scope_project, scope_paths, scope_file_types, scope_branches,
  category, tags, type, nature, trigger, wrong_pattern, correct_pattern,
  correct_pattern_code_example, correct_pattern_import_path, correct_pattern_tldr,
  reasoning, when_expression, confidence, demerit, demerit_last_updated,
  current_tier, max_tier_ever, tier_entered_at, enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  evidence, source, conflict_with, created_at, last_hit_at, last_validated_at,
  channel,
  trigger_description, pattern_description, hard_negatives,
  threshold_alpha, threshold_beta, fire_threshold, observation_window, embedder_model_id
) VALUES (
  @id, @scope_level, @scope_project, @scope_paths, @scope_file_types, @scope_branches,
  @category, @tags, @type, @nature, @trigger, @wrong_pattern, @correct_pattern,
  @correct_pattern_code_example, @correct_pattern_import_path, @correct_pattern_tldr,
  @reasoning, @when_expression, @confidence, @demerit, @demerit_last_updated,
  @current_tier, @max_tier_ever, @tier_entered_at, @enforcement, @status,
  @hit_count, @success_count, @override_count, @resurrect_count,
  @evidence, @source, @conflict_with, @created_at, @last_hit_at, @last_validated_at,
  @channel,
  @trigger_description, @pattern_description, @hard_negatives,
  @threshold_alpha, @threshold_beta, @fire_threshold, @observation_window, @embedder_model_id
)`;
var SELECT_BY_ID = "SELECT * FROM knowledge WHERE id = @id";
var SELECT_ALL = "SELECT * FROM knowledge";
var SELECT_BY_SCOPE = "SELECT * FROM knowledge WHERE scope_level = @level";
var SELECT_ACTIVE = "SELECT * FROM knowledge WHERE status = 'active'";
var DELETE_BY_ID = "DELETE FROM knowledge WHERE id = @id";
var SqliteKnowledgeStore = class {
  db;
  embedder;
  constructor(db, opts = {}) {
    this.db = db;
    this.embedder = opts.embedder;
  }
  /**
   * Insert + auto-embed in one shot. Behaviour:
   *   1. Persist row via add() (synchronous SQL + FTS5).
   *   2. If an embedder is wired and at least one description field is non-empty,
   *      encode trigger/pattern/tool_context descriptions, write vec0 rows,
   *      and stamp embedder_model_id so downstream semanticMatch can see the rule.
   *   3. Embedding failure is swallowed (logged to stderr) — the row is not lost;
   *      operators can run `pnpm teamagent migrate-v6 --repair-all` to retry.
   *
   * Returning a Promise lets callers (init/pitfall/extract pipelines) await
   * embedding completion before status output. Hot-path PreToolUse hook reads
   * via findActive(); this is the rule write-path, so a few hundred ms of
   * embedder latency is acceptable here.
   */
  async addWithEmbedding(entry) {
    this.add(entry);
    await this.syncEmbeddingsFor(entry).catch((err) => {
      process.stderr.write(
        `[teamagent] auto-embed failed for ${entry.id}: ${err.message}
`
      );
    });
  }
  async updateWithEmbedding(id, patch) {
    this.update(id, patch);
    const merged = this.getById(id);
    if (!merged) return;
    await this.syncEmbeddingsFor(merged).catch((err) => {
      process.stderr.write(
        `[teamagent] auto-embed update failed for ${id}: ${err.message}
`
      );
    });
  }
  async syncEmbeddingsFor(entry) {
    if (!this.embedder) return;
    const e = entry;
    const trigDescr = e.trigger_description ?? "";
    const patDescr = e.pattern_description ?? "";
    const toolDescr = e.tool_context_description ?? "";
    if (!trigDescr && !patDescr && !toolDescr) return;
    const texts = [trigDescr || " ", patDescr || " ", toolDescr || " "];
    const vecs = await this.embedder.embed(texts);
    const t = vecs?.[0];
    const p = vecs?.[1];
    if (!t || !p) {
      throw new Error("embedder returned insufficient vectors");
    }
    syncRuleVectors(this.db, entry.id, new Float32Array(t), new Float32Array(p));
    const toolVec = vecs[2];
    if (toolDescr && toolVec) {
      syncToolVector(this.db, entry.id, new Float32Array(toolVec));
    }
    this.db.prepare("UPDATE knowledge SET embedder_model_id = ? WHERE id = ?").run(this.embedder.modelId, entry.id);
  }
  add(entry) {
    const params = serializeEntry(entry);
    this.db.prepare(INSERT_SQL).run(params);
    if (entry.trigger_description || entry.pattern_description) {
      try {
        this.db.prepare(
          `INSERT OR REPLACE INTO knowledge_fts(id, trigger_description, pattern_description)
           VALUES (?, ?, ?)`
        ).run(
          entry.id,
          entry.trigger_description ?? "",
          entry.pattern_description ?? ""
        );
      } catch {
      }
    }
  }
  getById(id) {
    const row = this.db.prepare(SELECT_BY_ID).get({ id });
    return row ? deserializeRow(row) : void 0;
  }
  /** Batch fetch by a list of ids. Missing ids are silently omitted. */
  byIds(ids) {
    if (ids.length === 0) return [];
    return ids.map((id) => this.getById(id)).filter((e) => e !== void 0);
  }
  getAll() {
    const rows = this.db.prepare(SELECT_ALL).all();
    return rows.map(deserializeRow);
  }
  findByScopeLevel(level) {
    const rows = this.db.prepare(SELECT_BY_SCOPE).all({ level });
    return rows.map(deserializeRow);
  }
  findActive() {
    const rows = this.db.prepare(SELECT_ACTIVE).all();
    return rows.map(deserializeRow);
  }
  /** KnowledgeStore port compatibility */
  getActive() {
    return this.findActive();
  }
  count() {
    const row = this.db.prepare("SELECT COUNT(*) as n FROM knowledge").get();
    return row.n;
  }
  query(options = {}) {
    let entries = options.includeArchived ? this.getAll() : this.findActive();
    if (options.keyword) {
      const kw = options.keyword.toLowerCase();
      entries = entries.filter(
        (e) => e.trigger.toLowerCase().includes(kw) || e.correct_pattern.toLowerCase().includes(kw) || (e.wrong_pattern ?? "").toLowerCase().includes(kw) || e.tags.some((t) => t.toLowerCase().includes(kw))
      );
    }
    if (options.category) {
      entries = entries.filter((e) => e.category === options.category);
    }
    if (options.minConfidence !== void 0) {
      entries = entries.filter((e) => e.confidence >= options.minConfidence);
    }
    if (options.limit !== void 0) {
      entries = entries.slice(0, options.limit);
    }
    return entries;
  }
  update(id, patch) {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Knowledge entry not found: ${id}`);
    }
    const merged = { ...existing, ...patch };
    if (patch.scope) {
      merged.scope = { ...existing.scope, ...patch.scope };
    }
    const params = serializeEntry(merged);
    const setClauses = [
      "scope_level = @scope_level",
      "scope_project = @scope_project",
      "scope_paths = @scope_paths",
      "scope_file_types = @scope_file_types",
      "scope_branches = @scope_branches",
      "category = @category",
      "tags = @tags",
      "type = @type",
      "nature = @nature",
      "trigger = @trigger",
      "wrong_pattern = @wrong_pattern",
      "correct_pattern = @correct_pattern",
      "correct_pattern_code_example = @correct_pattern_code_example",
      "correct_pattern_import_path = @correct_pattern_import_path",
      "correct_pattern_tldr = @correct_pattern_tldr",
      "reasoning = @reasoning",
      "when_expression = @when_expression",
      "confidence = @confidence",
      "demerit = @demerit",
      "demerit_last_updated = @demerit_last_updated",
      "current_tier = @current_tier",
      "max_tier_ever = @max_tier_ever",
      "tier_entered_at = @tier_entered_at",
      "enforcement = @enforcement",
      "status = @status",
      "hit_count = @hit_count",
      "success_count = @success_count",
      "override_count = @override_count",
      "resurrect_count = @resurrect_count",
      "evidence = @evidence",
      "source = @source",
      "conflict_with = @conflict_with",
      "created_at = @created_at",
      "last_hit_at = @last_hit_at",
      "last_validated_at = @last_validated_at",
      "channel = @channel",
      "trigger_description = @trigger_description",
      "pattern_description = @pattern_description",
      "hard_negatives = @hard_negatives",
      "threshold_alpha = @threshold_alpha",
      "threshold_beta = @threshold_beta",
      "fire_threshold = @fire_threshold",
      "observation_window = @observation_window",
      "embedder_model_id = @embedder_model_id"
    ];
    const sql = `UPDATE knowledge SET ${setClauses.join(", ")} WHERE id = @id`;
    this.db.prepare(sql).run(params);
    const trigDescr = merged.trigger_description ?? merged.trigger_description;
    const patDescr = merged.pattern_description ?? merged.pattern_description;
    if (trigDescr || patDescr) {
      try {
        this.db.prepare(`DELETE FROM knowledge_fts WHERE id = ?`).run(id);
        this.db.prepare(
          `INSERT INTO knowledge_fts(id, trigger_description, pattern_description)
           VALUES (?, ?, ?)`
        ).run(id, trigDescr ?? "", patDescr ?? "");
      } catch {
      }
    }
  }
  delete(id) {
    this.db.prepare(DELETE_BY_ID).run({ id });
  }
  close() {
    this.db.close();
  }
};

// ../adapters/src/storage/sqlite/sqlite-event-log.ts
init_cjs_shims();
var import_node_module2 = require("module");
var require3 = (0, import_node_module2.createRequire)(importMetaUrl);
var { DatabaseSync } = require3("node:sqlite");
var CORE_KEYS = /* @__PURE__ */ new Set(["id", "kind", "knowledge_id", "tool_use_id", "timestamp", "schema_version"]);
var SqliteEventLog = class {
  db;
  constructor(db) {
    this.db = db;
  }
  append(e) {
    const payload = {};
    for (const [k, v] of Object.entries(e)) {
      if (!CORE_KEYS.has(k)) payload[k] = v;
    }
    this.db.prepare(`
      INSERT OR IGNORE INTO events (id, kind, knowledge_id, tool_use_id, timestamp, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      e.id,
      e.kind,
      e.knowledge_id ?? null,
      e.tool_use_id ?? null,
      e.timestamp,
      Object.keys(payload).length ? JSON.stringify(payload) : null
    );
  }
  readAll() {
    const rows = this.db.prepare("SELECT * FROM events ORDER BY timestamp ASC").all();
    return rows.map(this.hydrate);
  }
  readByKind(kind) {
    const rows = this.db.prepare("SELECT * FROM events WHERE kind = ? ORDER BY timestamp ASC").all(kind);
    return rows.map(this.hydrate);
  }
  readLast(n) {
    const rows = this.db.prepare("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?").all(n);
    return rows.map(this.hydrate);
  }
  close() {
    this.db.close();
  }
  hydrate = (row) => {
    let extra = {};
    if (row.payload) {
      try {
        extra = JSON.parse(row.payload);
      } catch {
      }
    }
    return {
      id: row.id,
      kind: row.kind,
      knowledge_id: row.knowledge_id ?? void 0,
      tool_use_id: row.tool_use_id ?? void 0,
      timestamp: row.timestamp,
      schema_version: 1,
      ...extra
    };
  };
};

// ../adapters/src/storage/sqlite/sqlite-observations.ts
init_cjs_shims();
var import_node_module3 = require("module");
var require4 = (0, import_node_module3.createRequire)(importMetaUrl);
var { DatabaseSync: DatabaseSync2 } = require4("node:sqlite");

// ../adapters/src/storage/sqlite/dual-layer-store.ts
init_cjs_shims();

// ../adapters/src/storage/sqlite/schema.ts
init_cjs_shims();
var import_node_module4 = require("module");
var require5 = (0, import_node_module4.createRequire)(importMetaUrl);
var { DatabaseSync: DatabaseSyncCtor } = require5("node:sqlite");
var _sqliteVecLoad;
try {
  const mod = require5("sqlite-vec");
  _sqliteVecLoad = mod.load;
} catch {
}
var INIT_SQL = `
-- \u77E5\u8BC6\u4E3B\u8868
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  scope_level TEXT NOT NULL CHECK(scope_level IN ('personal','team','global')),
  scope_project TEXT,
  scope_paths TEXT,
  scope_file_types TEXT,
  scope_branches TEXT,
  category TEXT NOT NULL,
  tags TEXT,
  type TEXT NOT NULL,
  nature TEXT NOT NULL,
  trigger TEXT NOT NULL,
  wrong_pattern TEXT DEFAULT '',
  correct_pattern TEXT NOT NULL,
  correct_pattern_code_example TEXT,
  correct_pattern_import_path TEXT,
  correct_pattern_tldr TEXT,
  reasoning TEXT,
  when_expression TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  demerit REAL NOT NULL DEFAULT 0,
  demerit_last_updated TEXT,
  current_tier TEXT NOT NULL DEFAULT 'experimental'
    CHECK(current_tier IN ('experimental','probation','stable','canonical','enforced','dormant')),
  max_tier_ever TEXT NOT NULL DEFAULT 'experimental',
  tier_entered_at TEXT NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'passive',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','conflict','stale','archived','dormant')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  override_count INTEGER NOT NULL DEFAULT 0,
  resurrect_count INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  source TEXT NOT NULL,
  conflict_with TEXT,
  created_at TEXT NOT NULL,
  last_hit_at TEXT,
  last_validated_at TEXT,
  -- M4-A: \u89C4\u5219\u901A\u9053\u3002tool-action \u662F\u5411\u540E\u517C\u5BB9\u9ED8\u8BA4\u503C\u3002
  channel TEXT NOT NULL DEFAULT 'tool-action'
    CHECK(channel IN ('tool-action','ai-narrative','user-input','passive-knowledge'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tier ON knowledge(current_tier);
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(scope_level, scope_project);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge(status);

-- \u89C2\u5BDF\u8868\uFF08Calibrator \u7528\uFF0Cv2 \u65B0\u589E\uFF09
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
  source_event TEXT,
  tool_use_id TEXT,
  FOREIGN KEY(knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obs_knowledge ON observations(knowledge_id, timestamp DESC);

-- \u4E8B\u4EF6\u8868\uFF08\u66FF\u4EE3 JsonlEventLog\uFF0C\u5168\u5386\u53F2 append-only\uFF09
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  knowledge_id TEXT,
  tool_use_id TEXT,
  timestamp TEXT NOT NULL,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_knowledge ON events(knowledge_id);

-- \u5019\u9009\u89C4\u5219\u961F\u5217\uFF08M2.5-half\uFF0Creview-candidates \u7528\uFF09
CREATE TABLE IF NOT EXISTS rule_candidates (
  id          TEXT PRIMARY KEY,
  entry_json  TEXT NOT NULL,
  source_signals TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','skipped')),
  created_at  TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON rule_candidates(status, created_at ASC);

-- schema \u7248\u672C\u8868\uFF08\u540E\u7EED migration \u7528\uFF09
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (1, datetime('now'));
`;
var V6_FTS_ONLY = `
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id UNINDEXED,
  trigger_description,
  pattern_description,
  tokenize='porter unicode61'
);
`;
var V6_ALTER_COLUMNS = [
  "trigger_description TEXT DEFAULT ''",
  "pattern_description TEXT DEFAULT ''",
  "hard_negatives BLOB",
  "threshold_alpha REAL DEFAULT 1.0",
  "threshold_beta REAL DEFAULT 1.0",
  `fire_threshold REAL DEFAULT ${DEFAULT_FIRE_THRESHOLD}`,
  "observation_window BLOB",
  "embedder_model_id TEXT DEFAULT ''"
];
function applyV6Migration(db) {
  const existing = new Set(
    db.prepare("PRAGMA table_info(knowledge)").all().map((c) => c.name)
  );
  for (const colDef of V6_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!colName) continue;
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  try {
    db.exec(V6_FTS_ONLY);
  } catch {
  }
  if (_sqliteVecLoad) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_trigger_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_pattern_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
    } catch {
    }
  }
}
var V7_ALTER_COLUMNS = [
  "tool_context_description TEXT DEFAULT ''"
];
function applyV7Migration(db) {
  const existing = new Set(
    db.prepare("PRAGMA table_info(knowledge)").all().map((c) => c.name)
  );
  for (const colDef of V7_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!colName) continue;
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  if (_sqliteVecLoad) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_tool_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
    } catch {
    }
  }
}
function openDb(path19) {
  const db = new DatabaseSyncCtor(path19, { allowExtension: true });
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  if (_sqliteVecLoad) {
    try {
      _sqliteVecLoad(db);
    } catch {
    }
  }
  db.exec(INIT_SQL);
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
      knowledge_id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    )`);
  } catch {
  }
  const version = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!version || version.version < 2) {
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (2, datetime('now'))");
  }
  if (!version || version.version < 3) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
        knowledge_id TEXT PRIMARY KEY,
        embedding FLOAT[384]
      )`);
    } catch {
    }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (3, datetime('now'))");
  }
  const versionNow = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionNow || versionNow.version < 4) {
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (4, datetime('now'))");
  }
  const versionM4 = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionM4 || versionM4.version < 5) {
    try {
      db.exec("ALTER TABLE knowledge ADD COLUMN channel TEXT NOT NULL DEFAULT 'tool-action'");
    } catch {
    }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (5, datetime('now'))");
  }
  const versionM4B = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionM4B || versionM4B.version < 6) {
    applyV6Migration(db);
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (6, datetime('now'))");
  }
  applyV6Migration(db);
  const versionM6 = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionM6 || versionM6.version < 7) {
    applyV7Migration(db);
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (7, datetime('now'))");
  }
  applyV7Migration(db);
  const versionWikiDrop = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionWikiDrop || versionWikiDrop.version < 8) {
    db.exec("DROP TABLE IF EXISTS wiki_meta");
    db.exec("DROP TABLE IF EXISTS wiki_subscriptions");
    db.exec("DROP TABLE IF EXISTS wiki_rejection_log");
    db.exec("DROP TABLE IF EXISTS wiki_entries");
    db.exec("DROP TABLE IF EXISTS wiki_sources");
    db.exec("DROP TABLE IF EXISTS wiki_rejections");
    try {
      db.exec("DROP TABLE IF EXISTS wiki_entries_vec");
    } catch {
    }
    try {
      db.exec("DROP TABLE IF EXISTS wiki_entries_fts");
    } catch {
    }
    try {
      db.exec("DROP TABLE IF EXISTS wiki_vec");
    } catch {
    }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (8, datetime('now'))");
  }
  return db;
}

// ../adapters/src/storage/sqlite/dual-layer-store.ts
var DualLayerStore = class {
  project;
  global;
  constructor(cfg) {
    this.project = new SqliteKnowledgeStore(openDb(cfg.projectDbPath), { embedder: cfg.embedder });
    this.global = new SqliteKnowledgeStore(openDb(cfg.userGlobalDbPath), { embedder: cfg.embedder });
  }
  add(entry) {
    switch (entry.scope.level) {
      case "personal":
      case "team":
        this.project.add(entry);
        return;
      case "global":
        this.global.add(entry);
        return;
      default:
        throw new Error(`unknown scope level: ${entry.scope.level}`);
    }
  }
  /** Same routing as add() but uses the embedder-aware path on the underlying store. */
  async addWithEmbedding(entry) {
    switch (entry.scope.level) {
      case "personal":
        await this.project.addWithEmbedding(entry);
        return;
      case "global":
        await this.global.addWithEmbedding(entry);
        return;
      case "team":
        await this.project.addWithEmbedding(entry);
        return;
      default:
        throw new Error(`unknown scope level: ${entry.scope.level}`);
    }
  }
  async updateWithEmbedding(id, patch) {
    if (this.project.getById(id) !== void 0) {
      await this.project.updateWithEmbedding(id, patch);
    } else if (this.global.getById(id) !== void 0) {
      await this.global.updateWithEmbedding(id, patch);
    } else {
      throw new Error(`Knowledge entry not found in any layer: ${id}`);
    }
  }
  getById(id) {
    return this.project.getById(id) ?? this.global.getById(id);
  }
  findActive() {
    return [...this.project.findActive(), ...this.global.findActive()];
  }
  getAll() {
    return [...this.project.getAll(), ...this.global.getAll()];
  }
  getProjectStore() {
    return this.project;
  }
  getGlobalStore() {
    return this.global;
  }
  /** B-063: implement KnowledgeStore.update() — routes to the layer that owns the entry. */
  update(id, patch) {
    if (this.project.getById(id) !== void 0) {
      this.project.update(id, patch);
    } else if (this.global.getById(id) !== void 0) {
      this.global.update(id, patch);
    } else {
      throw new Error(`Knowledge entry not found in any layer: ${id}`);
    }
  }
  /** B-063: implement KnowledgeStore.delete() */
  delete(id) {
    if (this.project.getById(id) !== void 0) {
      this.project.delete(id);
    } else {
      this.global.delete(id);
    }
  }
  /** B-063: implement KnowledgeStore.count() */
  count() {
    return this.project.count() + this.global.count();
  }
  /** B-063: implement KnowledgeStore.findByScopeLevel() */
  findByScopeLevel(level) {
    if (level === "global") return this.global.findByScopeLevel("global");
    return this.project.findByScopeLevel(level);
  }
  close() {
    this.project.close();
    this.global.close();
  }
};

// ../adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts
init_cjs_shims();

// ../adapters/src/hook/claude-agent-sdk/post-tool-use-sdk.ts
init_cjs_shims();

// ../adapters/src/util/normalize-cwd.ts
init_cjs_shims();
function normalizeCwd(p) {
  const m = p.match(/^\/([a-zA-Z])\/(.*)$/);
  if (m) return `${m[1].toUpperCase()}:/${m[2]}`;
  return p;
}

// ../adapters/src/storage/in-memory-store.ts
init_cjs_shims();

// ../adapters/src/attribution/in-memory-bus.ts
init_cjs_shims();
var InMemoryAttributionBus = class {
  buffer = [];
  subscribers = /* @__PURE__ */ new Set();
  emit(event) {
    this.buffer.push(event);
    for (const handler of this.subscribers) {
      handler(event);
    }
  }
  subscribe(handler) {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }
  drain() {
    const copy = this.buffer.slice();
    this.buffer = [];
    return copy;
  }
};

// ../adapters/src/attribution/stdout-renderer.ts
init_cjs_shims();
var DIVIDER = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";
var HEADER = "\u2728 TeamAgent \xB7 \u672C\u6B21\u64CD\u4F5C\u5F52\u56E0";
function describeAction(event) {
  switch (event.kind) {
    case "pitfall.added":
      return `\u6DFB\u52A0\u77E5\u8BC6\u6761\u76EE ${event.knowledgeId} (${event.category}/${event.tag})`;
    case "skeleton.knowledge-added":
      return `[skeleton] \u6DFB\u52A0\u6A21\u62DF\u77E5\u8BC6 ${event.knowledgeId} + legacy markdown \u9884\u89C8`;
    case "skeleton.l0-validation":
      return event.ok ? `[skeleton] L0 \u901A\u8FC7\u6F14\u793A ${event.knowledgeId}` : `[skeleton] L0 \u62D2\u7EDD\u6F14\u793A ${event.knowledgeId}`;
    case "skeleton.skills-compiled":
      return "[skeleton] Skills \u7F16\u8BD1\u6F14\u793A";
    case "extractor.deduped":
      return `\u53BB\u91CD: ${event.count} \u6761`;
    case "extractor.skipped":
      return `\u8DF3\u8FC7: ${event.count} \u6761`;
    case "extractor.extracted":
      return `\u63D0\u53D6\u77E5\u8BC6 ${event.knowledgeId}`;
    case "extractor.rejected-l0":
      return `L0 \u62D2\u7EDD ${event.knowledgeId}`;
    case "extractor.failed":
      return `\u63D0\u53D6\u5931\u8D25 (${event.count})`;
    case "compiler.recompiled":
      return `\u91CD\u7F16\u8BD1\u5B8C\u6210 (+${event.count})`;
    case "compiler.failed":
      return "\u91CD\u7F16\u8BD1\u5931\u8D25";
    case "ingest.failed":
      return `ingest \u5931\u8D25 (${event.count})`;
    case "ingest.skipped":
      return `ingest \u8DF3\u8FC7 (${event.count})`;
    case "ingest.rejected-l0":
      return `ingest L0 \u62D2\u7EDD ${event.knowledgeId}`;
    case "ingest.accepted":
      return `\u5165\u5E93 ${event.knowledgeId}`;
    case "importer.skipped":
      return "\u5BFC\u5165\u8DF3\u8FC7";
    case "importer.structured":
      return "\u5DF2\u5BFC\u5165";
    case "importer.failed":
      return "\u5BFC\u5165\u5931\u8D25";
    case "validator.blocked-promotion":
      return `${event.level.toUpperCase()} \u963B\u65AD\u664B\u5347 ${event.knowledgeId}: ${event.fromTier} \u2192 ${event.toTier}`;
    case "calibrator.adjusted":
      return `\u6821\u51C6 ${event.knowledgeId}: ${event.confidenceBefore.toFixed(2)} \u2192 ${event.confidenceAfter.toFixed(2)}`;
    case "calibrator.v2-adjusted":
      return `\u6821\u51C6 ${event.knowledgeId}: tier ${event.tierBefore} \u2192 ${event.tierAfter}`;
    case "compile.skill-should-write":
      return `tier ${event.tierBefore} \u2192 ${event.tierAfter}\uFF0C\u5C06\u5BFC\u51FA skill ${event.knowledgeId}`;
    case "compile.skill-should-remove":
      return `tier ${event.tierBefore} \u2192 ${event.tierAfter}\uFF0C\u5C06\u79FB\u9664 skill ${event.knowledgeId}`;
    case "compile.skills-compiled":
      return `Skills \u7F16\u8BD1\u5B8C\u6210: \u5199\u5165 ${event.written}\uFF0C\u79FB\u9664 ${event.removed}`;
    case "hook-stop.rules-vectorized":
      return `\u5411\u91CF\u5316\u8865\u5168 ${event.count} \u6761\u89C4\u5219`;
    case "hook-stop.analyze-started":
      return `\u5206\u6790\u4F1A\u8BDD\u4E2D (${event.modeTag})`;
    case "hook-stop.analyze-finished":
      return event.firstLine ?? "\u5206\u6790\u5B8C\u6210";
    case "hook-stop.analyze-skipped":
      return `\u8DF3\u8FC7 analyze: ${event.reason}`;
    case "hook-stop.calibration-started":
      return "\u6821\u51C6\u7F6E\u4FE1\u5EA6\u4E2D";
    case "hook-stop.calibration-finished":
      return "\u6821\u51C6\u5B8C\u6210";
    case "hook-stop.skills-updating":
      return "\u66F4\u65B0 Skills \u4E2D";
    case "hook-stop.skills-exported":
      return `Skills \u5BFC\u51FA ${event.count} \u6761`;
    case "hook-stop.scan-errors-started":
      return "\u626B\u63CF\u5DE5\u5177\u5931\u8D25\u4FE1\u53F7 (scan-errors)";
    case "hook-stop.scan-errors-progress":
      return `scan-errors ${event.lastLine}`;
    case "hook-stop.scan-errors-timeout":
      return `scan-errors \u8D85\u65F6 (>${event.timeoutMs}ms)\uFF0C\u8DF3\u8FC7`;
    case "hook-stop.semantic-scan-hit":
      return `semantic-scan \u547D\u4E2D ${event.count} \u6761\u89C4\u5219`;
    case "hook-stop.semantic-scan-timeout":
      return `semantic-scan \u8D85\u65F6 (>${event.timeoutMs}ms)\uFF0C\u8DF3\u8FC7`;
    case "hook-stop.skip-concurrent":
      return `stop hook pid ${event.otherPid} \u4ECD\u5728\u8FD0\u884C\uFF0C\u8DF3\u8FC7\u672C\u6B21 Stop event`;
    case "hook-pre.matched":
      return `pre-hook \u547D\u4E2D\u89C4\u5219 ${event.ruleId} \u2192 ${event.permissionDecision}`;
    case "hook-pre.passed":
      return `pre-hook \u901A\u8FC7 (\u626B\u63CF ${event.ruleCount} \u6761\u89C4\u5219)`;
    case "user-prompt.injected":
      return `user-prompt \u6CE8\u5165 ${event.injectedIds.length} \u6761\u89C4\u5219`;
    case "user-prompt.flagged":
      return `user-prompt \u6807\u8BB0\u89C4\u5219 ${event.ruleId}`;
    // issue #245: 升级流程遥测
    case "update-prompt-shown":
      return `\u5347\u7EA7 banner \u5DF2\u5F39\u51FA: ${event.fromVer || "(\u521D\u88C5)"} \u2192 ${event.toVer} (snooze \u7EA7\u522B ${event.snoozeLevel})`;
    case "update-snoozed":
      return `\u5347\u7EA7 snooze \u5230\u7EA7\u522B ${event.level} (\u9759\u97F3\u81F3 ${new Date(event.untilTs).toISOString()})`;
    case "update-never-set":
      return "\u5347\u7EA7 banner \u5DF2\u6C38\u4E45\u5173\u95ED (never_prompt=true)";
    case "update-installed":
      return `\u5347\u7EA7\u5B8C\u6210: ${event.fromVer || "(\u521D\u88C5)"} \u2192 ${event.toVer} (\u7528\u65F6 ${event.durationMs}ms)`;
    default: {
      const _exhaustive = event;
      void _exhaustive;
      return "\u672A\u77E5\u4E8B\u4EF6";
    }
  }
}
function describeKnowledgeChange(event) {
  if (event.kind === "pitfall.added") {
    return `${event.knowledgeCountBefore} \u2192 ${event.knowledgeCountAfter} \u6761 (${event.level}/${event.category}/${event.tag})`;
  }
  if (event.kind === "skeleton.knowledge-added") {
    return `${event.knowledgeCountBefore} \u2192 ${event.knowledgeCountAfter} \u6761`;
  }
  return void 0;
}
function describeTarget(event) {
  if (event.kind === "pitfall.added") {
    return event.skillMdPath;
  }
  return void 0;
}
var StdoutRenderer = class {
  render(events, mode) {
    if (mode === "silent") return "";
    const visible = mode === "verbose" ? events : events.filter((e) => e.severity !== "info");
    if (visible.length === 0) return "";
    const lines = [DIVIDER, HEADER, DIVIDER];
    for (const e of visible) {
      lines.push(`\u25B8 \u505A\u4E86\u4EC0\u4E48: ${sanitizeUserFacingText(describeAction(e))}`);
      const change = describeKnowledgeChange(e);
      if (change) lines.push(`\u25B8 \u77E5\u8BC6\u5E93\u53D8\u5316: ${sanitizeUserFacingText(change)}`);
      const target = describeTarget(e);
      if (target) lines.push(`\u25B8 \u4F20\u64AD\u5230: ${sanitizeUserFacingText(target)}`);
      if (e.userFacingValue) {
        lines.push(`\u25B8 \u4E0B\u6B21\u4F53\u9A8C: ${sanitizeUserFacingText(e.userFacingValue)}`);
      }
      if (mode === "verbose" && e.counterfactual) {
        lines.push(`\u25B8 \u5982\u679C\u6CA1\u6709 TeamAgent: ${sanitizeUserFacingText(e.counterfactual)}`);
      }
    }
    lines.push(DIVIDER);
    if (mode === "verbose") {
      lines.push("");
      lines.push("--- raw events ---");
      lines.push(sanitizeUserFacingText(JSON.stringify(events, null, 2)));
    }
    return lines.join("\n");
  }
};

// ../adapters/src/compiler/markdown-compiler.ts
init_cjs_shims();
var import_node_fs3 = __toESM(require("fs"), 1);
var import_node_path3 = __toESM(require("path"), 1);

// ../adapters/src/token-counter/index.ts
init_cjs_shims();

// ../adapters/src/token-counter/tiktoken.ts
init_cjs_shims();

// ../../node_modules/.pnpm/js-tiktoken@1.0.21/node_modules/js-tiktoken/dist/index.js
init_cjs_shims();

// ../../node_modules/.pnpm/js-tiktoken@1.0.21/node_modules/js-tiktoken/dist/chunk-VL2OQCWN.js
init_cjs_shims();
var import_base64_js = __toESM(require_base64_js(), 1);
var __defProp2 = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
function bytePairMerge(piece, ranks) {
  let parts = Array.from(
    { length: piece.length },
    (_, i) => ({ start: i, end: i + 1 })
  );
  while (parts.length > 1) {
    let minRank = null;
    for (let i = 0; i < parts.length - 1; i++) {
      const slice = piece.slice(parts[i].start, parts[i + 1].end);
      const rank = ranks.get(slice.join(","));
      if (rank == null)
        continue;
      if (minRank == null || rank < minRank[0]) {
        minRank = [rank, i];
      }
    }
    if (minRank != null) {
      const i = minRank[1];
      parts[i] = { start: parts[i].start, end: parts[i + 1].end };
      parts.splice(i + 1, 1);
    } else {
      break;
    }
  }
  return parts;
}
function bytePairEncode(piece, ranks) {
  if (piece.length === 1)
    return [ranks.get(piece.join(","))];
  return bytePairMerge(piece, ranks).map((p) => ranks.get(piece.slice(p.start, p.end).join(","))).filter((x) => x != null);
}
function escapeRegex(str) {
  return str.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
}
var _Tiktoken = class {
  /** @internal */
  specialTokens;
  /** @internal */
  inverseSpecialTokens;
  /** @internal */
  patStr;
  /** @internal */
  textEncoder = new TextEncoder();
  /** @internal */
  textDecoder = new TextDecoder("utf-8");
  /** @internal */
  rankMap = /* @__PURE__ */ new Map();
  /** @internal */
  textMap = /* @__PURE__ */ new Map();
  constructor(ranks, extendedSpecialTokens) {
    this.patStr = ranks.pat_str;
    const uncompressed = ranks.bpe_ranks.split("\n").filter(Boolean).reduce((memo, x) => {
      const [_, offsetStr, ...tokens] = x.split(" ");
      const offset = Number.parseInt(offsetStr, 10);
      tokens.forEach((token, i) => memo[token] = offset + i);
      return memo;
    }, {});
    for (const [token, rank] of Object.entries(uncompressed)) {
      const bytes = import_base64_js.default.toByteArray(token);
      this.rankMap.set(bytes.join(","), rank);
      this.textMap.set(rank, bytes);
    }
    this.specialTokens = { ...ranks.special_tokens, ...extendedSpecialTokens };
    this.inverseSpecialTokens = Object.entries(this.specialTokens).reduce((memo, [text, rank]) => {
      memo[rank] = this.textEncoder.encode(text);
      return memo;
    }, {});
  }
  encode(text, allowedSpecial = [], disallowedSpecial = "all") {
    const regexes = new RegExp(this.patStr, "ug");
    const specialRegex = _Tiktoken.specialTokenRegex(
      Object.keys(this.specialTokens)
    );
    const ret = [];
    const allowedSpecialSet = new Set(
      allowedSpecial === "all" ? Object.keys(this.specialTokens) : allowedSpecial
    );
    const disallowedSpecialSet = new Set(
      disallowedSpecial === "all" ? Object.keys(this.specialTokens).filter(
        (x) => !allowedSpecialSet.has(x)
      ) : disallowedSpecial
    );
    if (disallowedSpecialSet.size > 0) {
      const disallowedSpecialRegex = _Tiktoken.specialTokenRegex([
        ...disallowedSpecialSet
      ]);
      const specialMatch = text.match(disallowedSpecialRegex);
      if (specialMatch != null) {
        throw new Error(
          `The text contains a special token that is not allowed: ${specialMatch[0]}`
        );
      }
    }
    let start = 0;
    while (true) {
      let nextSpecial = null;
      let startFind = start;
      while (true) {
        specialRegex.lastIndex = startFind;
        nextSpecial = specialRegex.exec(text);
        if (nextSpecial == null || allowedSpecialSet.has(nextSpecial[0]))
          break;
        startFind = nextSpecial.index + 1;
      }
      const end = nextSpecial?.index ?? text.length;
      for (const match of text.substring(start, end).matchAll(regexes)) {
        const piece = this.textEncoder.encode(match[0]);
        const token2 = this.rankMap.get(piece.join(","));
        if (token2 != null) {
          ret.push(token2);
          continue;
        }
        ret.push(...bytePairEncode(piece, this.rankMap));
      }
      if (nextSpecial == null)
        break;
      let token = this.specialTokens[nextSpecial[0]];
      ret.push(token);
      start = nextSpecial.index + nextSpecial[0].length;
    }
    return ret;
  }
  decode(tokens) {
    const res = [];
    let length = 0;
    for (let i2 = 0; i2 < tokens.length; ++i2) {
      const token = tokens[i2];
      const bytes = this.textMap.get(token) ?? this.inverseSpecialTokens[token];
      if (bytes != null) {
        res.push(bytes);
        length += bytes.length;
      }
    }
    const mergedArray = new Uint8Array(length);
    let i = 0;
    for (const bytes of res) {
      mergedArray.set(bytes, i);
      i += bytes.length;
    }
    return this.textDecoder.decode(mergedArray);
  }
};
var Tiktoken = _Tiktoken;
__publicField(Tiktoken, "specialTokenRegex", (tokens) => {
  return new RegExp(tokens.map((i) => escapeRegex(i)).join("|"), "g");
});

// ../adapters/src/compiler/nested-rule-store.ts
init_cjs_shims();
var import_node_fs4 = __toESM(require("fs"), 1);
var import_node_os2 = __toESM(require("os"), 1);
var import_node_path4 = __toESM(require("path"), 1);
var DEFAULT_DIR = import_node_path4.default.join(import_node_os2.default.homedir(), ".claude", "teamagent", "rules");

// ../adapters/src/compiler/rule-compiler-factory.ts
init_cjs_shims();

// ../adapters/src/compiler/cursor-rules-compiler.ts
init_cjs_shims();
var import_node_fs5 = __toESM(require("fs"), 1);
var import_node_path5 = __toESM(require("path"), 1);

// ../adapters/src/session-source/claude-session-source.ts
init_cjs_shims();
var import_promises = __toESM(require("fs/promises"), 1);
var import_node_fs6 = __toESM(require("fs"), 1);
var import_node_path6 = __toESM(require("path"), 1);

// ../adapters/src/llm/claude-code-client.ts
init_cjs_shims();
var import_node_child_process = require("child_process");

// ../ports/src/index.ts
init_cjs_shims();

// ../ports/src/llm-client.ts
init_cjs_shims();

// ../ports/src/github-activity-port-inmemory.ts
init_cjs_shims();

// ../adapters/src/compiler/skill-compiler.ts
init_cjs_shims();
var import_node_os3 = __toESM(require("os"), 1);
var import_node_path7 = __toESM(require("path"), 1);
var import_promises2 = __toESM(require("fs/promises"), 1);
var import_node_crypto2 = require("crypto");
var DEFAULT_DIR2 = import_node_path7.default.join(import_node_os3.default.homedir(), ".claude", "skills", "teamagent");

// ../adapters/src/plugins/claude-plugin-installer.ts
init_cjs_shims();
var import_node_child_process2 = require("child_process");

// ../adapters/src/storage/sqlite/sqlite-candidate-queue.ts
init_cjs_shims();
var import_node_module5 = require("module");
var require6 = (0, import_node_module5.createRequire)(importMetaUrl);
var { DatabaseSync: DatabaseSync3 } = require6("node:sqlite");

// ../adapters/src/error-collector/composite-error-signal-collector.ts
init_cjs_shims();

// ../adapters/src/embedding/xenova-rule-embedder.ts
init_cjs_shims();
var import_node_fs7 = __toESM(require("fs"), 1);

// ../adapters/src/retriever/sqlite-semantic-retriever.ts
init_cjs_shims();
var import_node_module6 = require("module");
var require7 = (0, import_node_module6.createRequire)(importMetaUrl);
var { DatabaseSync: DatabaseSyncCtor2 } = require7("node:sqlite");
var RRF_K = 60;
var DEFAULT_TOP_K = 20;
var SqliteSemanticRetriever = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async retrieve(args) {
    const topK = args.topK ?? DEFAULT_TOP_K;
    const scores = /* @__PURE__ */ new Map();
    const addRRF = (id, rank, update) => {
      const prev = scores.get(id) ?? {
        rrf: 0,
        bm25: -1,
        triggerSim: -1,
        patternSim: -1
      };
      prev.rrf += 1 / (RRF_K + rank);
      if (update.bm25 !== void 0) prev.bm25 = update.bm25;
      if (update.triggerSim !== void 0) prev.triggerSim = update.triggerSim;
      if (update.patternSim !== void 0) prev.patternSim = update.patternSim;
      scores.set(id, prev);
    };
    try {
      const query = [args.contextText, args.actionText].join(" ").replace(/[^\w\s一-鿿]/g, " ").trim();
      if (query.length > 0) {
        const bm25Rows = this.db.prepare(
          `SELECT id, rank as bm25_rank
             FROM knowledge_fts
             WHERE knowledge_fts MATCH ?
             ORDER BY rank
             LIMIT ?`
        ).all(query, topK);
        bm25Rows.forEach((r, i) => addRRF(r.id, i + 1, { bm25: r.bm25_rank }));
      }
    } catch (err) {
      if (process.env.TEAMAGENT_HOOK_DEBUG === "1") {
        process.stderr.write(`[teamagent-retriever] BM25 stage failed: ${err.message}
`);
      }
    }
    try {
      const denseT = this.db.prepare(
        `SELECT id, distance
           FROM knowledge_trigger_vec
           WHERE vec MATCH ?
           ORDER BY distance
           LIMIT ?`
      ).all(new Uint8Array(args.contextVec.buffer), topK);
      denseT.forEach(
        (r, i) => addRRF(r.id, i + 1, { triggerSim: 1 - r.distance })
      );
    } catch (err) {
      if (process.env.TEAMAGENT_HOOK_DEBUG === "1") {
        process.stderr.write(`[teamagent-retriever] dense stage failed: ${err.message}
`);
      }
    }
    try {
      const denseP = this.db.prepare(
        `SELECT id, distance
           FROM knowledge_pattern_vec
           WHERE vec MATCH ?
           ORDER BY distance
           LIMIT ?`
      ).all(new Uint8Array(args.actionVec.buffer), topK);
      denseP.forEach(
        (r, i) => addRRF(r.id, i + 1, { patternSim: 1 - r.distance })
      );
    } catch (err) {
      if (process.env.TEAMAGENT_HOOK_DEBUG === "1") {
        process.stderr.write(`[teamagent-retriever] dense stage failed: ${err.message}
`);
      }
    }
    const debug = process.env.TEAMAGENT_HOOK_DEBUG === "1";
    if (debug) {
      process.stderr.write(
        `[teamagent-retriever] scope=${args.scope.level} stage1+2+3 \u2192 ${scores.size} candidates
`
      );
    }
    if (scores.size === 0) return [];
    const ids = [...scores.keys()];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db.prepare(
      `SELECT * FROM knowledge
         WHERE id IN (${placeholders})
           AND status = 'active'
           AND scope_level = ?`
    ).all(...ids, args.scope.level);
    if (debug) {
      process.stderr.write(
        `[teamagent-retriever] scope=${args.scope.level} after scope filter \u2192 ${rows.length} rows
`
      );
    }
    const out = rows.map((r) => {
      const s = scores.get(r.id);
      return {
        rule: deserializeRow(r),
        bm25Score: s.bm25,
        triggerSim: s.triggerSim,
        patternSim: s.patternSim,
        rrfScore: s.rrf
      };
    }).sort((a, b) => b.rrfScore - a.rrfScore).slice(0, topK);
    if (debug && out.length > 0) {
      for (const c of out.slice(0, 3)) {
        process.stderr.write(
          `[teamagent-retriever]   ${c.rule.id} bm25=${c.bm25Score.toFixed(3)} triggerSim=${c.triggerSim.toFixed(3)} patternSim=${c.patternSim.toFixed(3)} rrf=${c.rrfScore.toFixed(4)}
`
        );
      }
    }
    return out;
  }
};

// ../adapters/src/retriever/sqlite-tool-retriever.ts
init_cjs_shims();
var import_node_module7 = require("module");
var require8 = (0, import_node_module7.createRequire)(importMetaUrl);
var { DatabaseSync: DatabaseSyncCtor3 } = require8("node:sqlite");

// ../adapters/src/m5/fs-bootstrap.ts
init_cjs_shims();
var import_node_fs8 = require("fs");
var path8 = __toESM(require("path"), 1);

// ../adapters/src/m5/fs-team-rule-store.ts
init_cjs_shims();
var import_node_fs9 = require("fs");
var path9 = __toESM(require("path"), 1);

// ../adapters/src/github-activity/gh-cli-adapter.ts
init_cjs_shims();
var import_node_child_process3 = require("child_process");

// ../cli/src/user-prompt-rule-retriever.ts
var TOP_K = 3;
var MIN_SCORE = 0.35;
function passesCoOccurrenceGuard(rule, userMessage) {
  const pattern = rule.correct_pattern ?? "";
  const tokenRe = /\(\d+\)\s*[''‘’]([^''‘’]+)[''‘’]/g;
  const required = [];
  let m;
  while ((m = tokenRe.exec(pattern)) !== null) {
    const tok = m[1].trim();
    if (tok.length >= 3) required.push(tok);
  }
  if (required.length < 2) return true;
  const msgLower = userMessage.toLowerCase();
  return required.every((tok) => msgLower.includes(tok.toLowerCase()));
}
function buildTechStackText(cwd) {
  const presence = {
    exists: (rel) => {
      try {
        return import_node_fs10.default.existsSync(import_node_path8.default.join(cwd, rel));
      } catch {
        return false;
      }
    },
    read: (rel) => {
      try {
        return import_node_fs10.default.readFileSync(import_node_path8.default.join(cwd, rel), "utf-8");
      } catch {
        return void 0;
      }
    }
  };
  try {
    const stack = detectStack(presence);
    const parts = [
      ...stack.languages,
      ...stack.frameworks,
      ...stack.packageManagers,
      ...stack.testRunners
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "software project";
  } catch {
    return "software project";
  }
}
function buildTerminalSummary(tier1, tier2) {
  const all = [...tier1, ...tier2];
  if (all.length === 0) return "";
  const summary = all.map((r) => `${r.trigger.slice(0, 28)} -> ${r.correct_pattern.slice(0, 34)}`).join("; ");
  const content = `\u627E\u5230 ${all.length} \u6761\u76F8\u5173\u7ECF\u9A8C: ${summary}`;
  const maxContentLength = 150;
  const clipped = content.length > maxContentLength ? `${content.slice(0, maxContentLength - 3)}...` : content;
  return [
    "========|| TeamAgent ||========",
    `|| ${clipped} ||`,
    "========||===========||========"
  ].join("\n");
}
function formatRuleInjection(rules, tier) {
  if (rules.length === 0) return "";
  const lines = [`\u25C8 TeamAgent \u76F8\u5173\u7ECF\u9A8C\uFF08\u8BED\u4E49\u68C0\u7D22 ${tier}\uFF09`];
  for (const r of rules) {
    const conf = r.confidence.toFixed(2);
    lines.push(`- [${r.trigger.slice(0, 50)}] \u2192 ${r.correct_pattern.slice(0, 80)} (conf ${conf})`);
  }
  if (process.env.TEAMAGENT_AI_ANNOUNCE !== "0") {
    const triggers = rules.map((r) => r.trigger.slice(0, 30)).join(" / ");
    lines.push("");
    lines.push(`\u3010\u663E\u793A\u8981\u6C42\u3011\u8BF7\u5728\u4F60\u56DE\u590D\u7684\u6700\u5F00\u5934\u5355\u72EC\u7528\u4E00\u884C\u5199\uFF1A"\u{1F4CB} \u672C\u6B21\u53C2\u8003: ${triggers}"\uFF0C\u8BA9\u7528\u6237\u77E5\u9053\u8FD9\u4E9B\u7ECF\u9A8C\u5F71\u54CD\u4E86\u4F60\u7684\u56DE\u7B54\u3002\u7136\u540E\u518D\u6B63\u5E38\u56DE\u590D\u3002`);
  }
  return lines.join("\n");
}
async function queryRules(text, embedder, projectDbPath, globalDbPath, excludeIds, userMessage = text) {
  const dbsWithScope = [
    { path: projectDbPath, scope: "personal" },
    { path: projectDbPath, scope: "team" },
    { path: globalDbPath, scope: "global" }
  ];
  const dbs = [];
  const hits = [];
  try {
    for (const { path: dbPath, scope } of dbsWithScope) {
      if (!import_node_fs10.default.existsSync(dbPath)) continue;
      const db = openDb(dbPath);
      dbs.push(db);
      const retriever = new SqliteSemanticRetriever(db);
      const matches = await semanticMatch({
        contextText: text,
        actionText: text,
        embedder,
        retriever,
        scope: { level: scope },
        topK: TOP_K * 3
      });
      hits.push(...matches);
    }
  } finally {
    for (const db of dbs) {
      try {
        db.close();
      } catch {
      }
    }
  }
  const reranked = rerankByConfidence(hits);
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const m of reranked) {
    if (m.score < MIN_SCORE) continue;
    if (excludeIds.has(m.rule.id)) continue;
    if (seen.has(m.rule.id)) continue;
    if (!passesCoOccurrenceGuard(m.rule, userMessage)) continue;
    seen.add(m.rule.id);
    result.push(m.rule);
    if (result.length >= TOP_K) break;
  }
  return result;
}
async function retrieveRulesForPrompt(args) {
  if (!args.embedder) {
    throw new Error(
      "retrieveRulesForPrompt requires an explicit `embedder` (use DaemonFirstEmbedder for hook paths; XenovaRuleEmbedder remains for CLI/scripts)"
    );
  }
  const embedder = args.embedder;
  const allSeen = new Set(args.sessionSeenIds);
  let tier1Rules = [];
  if (args.isFirstPrompt) {
    const techText = buildTechStackText(args.cwd);
    tier1Rules = await queryRules(techText, embedder, args.projectDbPath, args.globalDbPath, allSeen, args.userMessage);
    for (const r of tier1Rules) allSeen.add(r.id);
  }
  const tier2Rules = await queryRules(
    args.userMessage,
    embedder,
    args.projectDbPath,
    args.globalDbPath,
    allSeen,
    args.userMessage
  );
  const blocks = [];
  const t1text = formatRuleInjection(tier1Rules, "T1");
  if (t1text) blocks.push(t1text);
  const t2text = formatRuleInjection(tier2Rules, "T2");
  if (t2text) blocks.push(t2text);
  return {
    tier1Rules,
    tier2Rules,
    injectionText: blocks.join("\n\n"),
    allInjectedIds: [
      ...tier1Rules.map((r) => r.id),
      ...tier2Rules.map((r) => r.id)
    ]
  };
}

// ../cli/src/commands/recording.ts
init_cjs_shims();
var import_node_fs11 = __toESM(require("fs"), 1);
var import_node_os4 = __toESM(require("os"), 1);
var import_node_path9 = __toESM(require("path"), 1);
var import_node_crypto3 = require("crypto");

// ../cli/src/find-teamagent-root.ts
init_cjs_shims();

// ../cli/src/lib/walk-up.ts
init_cjs_shims();
var fs12 = __toESM(require("fs"), 1);
var os4 = __toESM(require("os"), 1);
var path12 = __toESM(require("path"), 1);

// ../cli/src/lib/project-markers.ts
init_cjs_shims();
var fs11 = __toESM(require("fs"), 1);
var path11 = __toESM(require("path"), 1);
var PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "pnpm-workspace.yaml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  // TeamAgent-managed marker. `teamagent init` writes
  // `<dir>/.teamagent/.project-root` on first run so docs-only projects
  // (no .git, no package.json) are still discoverable by walk-up.
  path11.join(".teamagent", ".project-root")
];
function hasProjectMarker(dir) {
  for (const m of PROJECT_MARKERS) {
    if (fs11.existsSync(path11.join(dir, m))) return true;
  }
  return false;
}

// ../cli/src/lib/walk-up.ts
function findTeamagentRoot(start, opts) {
  const homeDir = opts?.homeDir ?? os4.homedir();
  let cur = path12.resolve(start);
  while (true) {
    const candidate = path12.join(cur, ".teamagent", "knowledge.db");
    try {
      if (fs12.lstatSync(candidate).isFile() && hasProjectMarker(cur)) return cur;
    } catch (err) {
      const code = err?.code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") {
      } else {
        process.stderr.write(
          `teamagent walk-up: ${code ?? String(err)} at ${candidate}; aborting walk
`
        );
        return null;
      }
    }
    if (cur === homeDir) return null;
    const parent = path12.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

// ../cli/src/find-teamagent-root.ts
function findTeamagentRoot2(cwd) {
  return findTeamagentRoot(cwd) ?? cwd;
}

// ../cli/src/commands/recording.ts
var DEFAULT_MAX_INJECTION_TOKENS = 800;
var SLOW_THRESHOLD_MS = 300;
var GOLDEN_MATERIALS = [
  {
    title: "Recording Memory import design review",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md",
    transcript: "Alice: Recording Memory should turn existing meeting transcripts and summaries into agent-loadable memory. Bob: Import must preserve source references. Chen: Do not inject the full transcript by default; cite the source and include a short summary unless explicitly expanded.",
    uploadedBy: "teamagent",
    useWhen: "Questions about recording-memory import, source references, concise prompt injection, and transcript expansion.",
    summary: "Recording Memory import stores transcripts, summaries, and source references. Default prompt injection cites the source and stays concise.",
    visibility: "public"
  },
  {
    title: "Recording Memory dashboard and latency review",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard",
    transcript: "Alice: We need externally visible evidence, not SelfVerify. Bob: The dashboard has to show latency numbers and counts for slow or empty queries. Chen: It should update after recording-memory activity.",
    uploadedBy: "teamagent",
    useWhen: "Questions about dashboard metrics, latency, slow retrievals, empty retrievals, failures, and oversized injections.",
    summary: "The dashboard must surface latency, slow retrievals, empty retrievals, failed retrievals, oversized injections, and latest Recording Memory activity.",
    visibility: "public"
  },
  {
    title: "Recording Memory golden prompt benchmark",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark",
    transcript: "Alice: We should use three real examples. Bob: Ten fixed prompts are enough for the first gate. Chen: Each row needs expected recording, actual recording, pass/fail, and injection token count. Dana: Full transcript should only appear with explicit expansion.",
    uploadedBy: "teamagent",
    useWhen: "Questions about golden prompt benchmark acceptance, ten prompts, three examples, pass rate, and token budget.",
    summary: "Golden benchmark uses three recording examples and ten fixed prompts. It passes at 8/10 correct retrievals with default injection under 800 tokens.",
    visibility: "public"
  }
];
var GOLDEN_PROMPTS = [
  { prompt: "What did we decide about importing recording transcripts?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "Where should recording memory cite source references?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "Should the full transcript be injected by default?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "How do we monitor slow recording-memory retrievals?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "What dashboard counts are required for recording memory?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "What evidence should show latency and empty retrievals?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "How many golden prompts are used for acceptance?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "What is the default recording memory token budget?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "What pass rate does the golden benchmark require?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "When is a full recording transcript allowed in context?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" }
];
function projectRoot(cwd) {
  return findTeamagentRoot2(cwd);
}
function projectKey(cwd) {
  return (0, import_node_crypto3.createHash)("sha256").update(import_node_path9.default.resolve(projectRoot(cwd))).digest("hex").slice(0, 20);
}
function legacyProjectKey(cwd) {
  return (0, import_node_crypto3.createHash)("sha256").update(import_node_path9.default.resolve(cwd)).digest("hex").slice(0, 20);
}
function publicStorePath(cwd) {
  return import_node_path9.default.join(projectRoot(cwd), ".teamagent", "recordings.json");
}
function privateStorePath(cwd, homeDir) {
  return import_node_path9.default.join(
    homeDir,
    ".teamagent",
    "recordings",
    `${projectKey(cwd)}.json`
  );
}
function legacyPrivateStorePath(cwd, homeDir) {
  return import_node_path9.default.join(
    homeDir,
    ".teamagent",
    "recordings",
    `${legacyProjectKey(cwd)}.json`
  );
}
function metricsPath(cwd) {
  return import_node_path9.default.join(projectRoot(cwd), ".teamagent", "recording-memory", "metrics.jsonl");
}
function readJsonl(filePath2) {
  try {
    return import_node_fs11.default.readFileSync(filePath2, "utf-8").split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function appendJsonl(filePath2, item) {
  import_node_fs11.default.mkdirSync(import_node_path9.default.dirname(filePath2), { recursive: true });
  import_node_fs11.default.appendFileSync(filePath2, JSON.stringify(item) + "\n", "utf-8");
}
function estimateRecordingTokens(text) {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
function appendMetric(cwd, now, metric) {
  const full = {
    ...metric,
    id: `rm-${now().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now().toISOString(),
    slow: metric.latencyMs > SLOW_THRESHOLD_MS,
    empty: metric.status === "empty",
    failed: metric.status === "failed",
    oversized: (metric.injectionTokens ?? 0) > DEFAULT_MAX_INJECTION_TOKENS
  };
  appendJsonl(metricsPath(cwd), full);
  return full;
}
function loadRecordingMetrics(cwd) {
  return readJsonl(metricsPath(cwd));
}
function summarizeRecordingMetrics(metrics) {
  const latencies = metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const percentile = (p) => {
    if (latencies.length === 0) return 0;
    return latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] ?? 0;
  };
  return {
    total: metrics.length,
    imports: metrics.filter((m) => m.operation === "import").length,
    searches: metrics.filter((m) => m.operation === "search").length,
    injections: metrics.filter((m) => m.operation === "inject").length,
    benchmarks: metrics.filter((m) => m.operation === "benchmark").length,
    slow: metrics.filter((m) => m.slow).length,
    empty: metrics.filter((m) => m.empty).length,
    failed: metrics.filter((m) => m.failed).length,
    oversized: metrics.filter((m) => m.oversized).length,
    p50LatencyMs: percentile(0.5),
    p95LatencyMs: percentile(0.95),
    latest: metrics.slice(-5).reverse()
  };
}
function readStore(filePath2) {
  try {
    const raw = import_node_fs11.default.readFileSync(filePath2, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeStore(filePath2, records) {
  import_node_fs11.default.mkdirSync(import_node_path9.default.dirname(filePath2), { recursive: true });
  import_node_fs11.default.writeFileSync(filePath2, JSON.stringify(records, null, 2) + "\n", "utf-8");
}
function loadPrivateStoreWithMigration(cwd, homeDir) {
  const newPath = privateStorePath(cwd, homeDir);
  if (import_node_fs11.default.existsSync(newPath)) return readStore(newPath);
  const legacyPath = legacyPrivateStorePath(cwd, homeDir);
  if (legacyPath !== newPath && import_node_fs11.default.existsSync(legacyPath)) {
    const records = readStore(legacyPath);
    if (records.length > 0) writeStore(newPath, records);
    return records;
  }
  return [];
}
function stringField(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}
function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function normalizeVisibility(value) {
  if (value === "public") return "public";
  if (value === void 0 || value === null || value === "private") return "private";
  throw new Error("visibility must be private or public");
}
function materialToRecord(input, opts) {
  const now = opts.now().toISOString();
  const source = stringField(
    input.source ?? input.sourceUrl ?? input.sourcePath,
    "source"
  );
  return {
    id: opts.idGen(),
    title: stringField(input.title, "title"),
    source,
    transcript: stringField(input.transcript, "transcript"),
    uploadedBy: stringField(input.uploadedBy ?? input.uploader, "uploadedBy"),
    useWhen: stringField(input.useWhen ?? input.usage, "useWhen"),
    summary: optionalString(input.summary) ?? stringField(input.transcript, "transcript").slice(0, 240),
    visibility: normalizeVisibility(input.visibility),
    createdAt: now,
    updatedAt: now
  };
}
function sanitizeRecord(record, expandTranscript = false) {
  const { transcript, ...rest } = record;
  return expandTranscript ? { ...rest, transcript } : rest;
}
function loadVisibleRecords(cwd, homeDir, visibility = "all") {
  const records = [];
  if (visibility === "all" || visibility === "public") {
    records.push(...readStore(publicStorePath(cwd)).filter((r) => r.visibility === "public"));
  }
  if (visibility === "all" || visibility === "private") {
    records.push(...loadPrivateStoreWithMigration(cwd, homeDir).filter((r) => r.visibility === "private"));
  }
  return records;
}
function tokenize(text) {
  return [...text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0]).filter((t) => t.length > 1);
}
function scoreRecord(query, record) {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return { score: 0, why: "" };
  const fields = [
    ["title", 4, "title"],
    ["summary", 4, "summary"],
    ["useWhen", 3, "useWhen"],
    ["transcript", 1, "transcript"],
    ["uploadedBy", 1, "uploadedBy"]
  ];
  let score = 0;
  const matchedFields = /* @__PURE__ */ new Set();
  for (const term of terms) {
    for (const [field, weight, label] of fields) {
      const value = String(record[field] ?? "").toLowerCase();
      if (value.includes(term)) {
        score += weight;
        matchedFields.add(label);
      }
    }
  }
  const coverage = matchedFields.size > 0 ? terms.length / Math.max(terms.length, 1) : 0;
  return {
    score: score + coverage,
    why: matchedFields.size > 0 ? `matched ${[...matchedFields].join(", ")}` : ""
  };
}
function searchRecords(query, records, limit, expandTranscript = false) {
  return records.map((record) => {
    const scored = scoreRecord(query, record);
    return {
      record: sanitizeRecord(record, expandTranscript),
      score: scored.score,
      whyRelevant: scored.why
    };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.record.createdAt.localeCompare(b.record.createdAt)).slice(0, limit);
}
async function executeRecording(opts) {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? import_node_os4.default.homedir();
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const idGen = opts.idGen ?? (() => `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  if (opts.action === "help") {
    return {
      kind: "help",
      command: "teamagent recording",
      subcommands: [
        {
          name: "import",
          usage: "teamagent recording import --file <material.json>",
          output: "imports transcript JSON (audio files are not supported)"
        },
        {
          name: "search",
          usage: "teamagent recording search --query <text> [--visibility=all|private|public]",
          output: "returns source-backed recording memory hits without full transcript"
        },
        {
          name: "show",
          usage: "teamagent recording show <id> [--transcript]",
          output: "shows metadata by default; --transcript expands full transcript"
        },
        {
          name: "inject",
          usage: "teamagent recording inject --query <text> [--full]",
          output: "returns source-cited prompt context without full transcript by default"
        },
        {
          name: "metrics",
          usage: "teamagent recording metrics [--json]",
          output: "summarizes import/search/injection latency and retrieval health"
        },
        {
          name: "benchmark",
          usage: "teamagent recording benchmark [--report=<path>] [--json]",
          output: "runs 3-recording/10-prompt golden retrieval benchmark"
        }
      ]
    };
  }
  if (opts.action === "import") {
    const started = Date.now();
    const raw = import_node_fs11.default.readFileSync(opts.filePath, "utf-8");
    const record2 = materialToRecord(JSON.parse(raw), {
      now,
      idGen
    });
    const storePath = record2.visibility === "public" ? publicStorePath(cwd) : privateStorePath(cwd, homeDir);
    const records2 = record2.visibility === "private" ? loadPrivateStoreWithMigration(cwd, homeDir) : readStore(storePath);
    const duplicate = records2.find((r) => r.source === record2.source);
    if (duplicate) {
      appendMetric(cwd, now, {
        operation: "import",
        status: "ok",
        latencyMs: Date.now() - started,
        recordingId: duplicate.id,
        sourceReference: duplicate.source,
        fullTranscriptIncluded: false
      });
      return {
        kind: "import",
        status: "duplicate",
        record: sanitizeRecord(duplicate),
        storage: duplicate.visibility
      };
    }
    records2.push(record2);
    writeStore(storePath, records2);
    appendMetric(cwd, now, {
      operation: "import",
      status: "ok",
      latencyMs: Date.now() - started,
      recordingId: record2.id,
      sourceReference: record2.source,
      fullTranscriptIncluded: false
    });
    return {
      kind: "import",
      status: "created",
      record: sanitizeRecord(record2),
      storage: record2.visibility
    };
  }
  if (opts.action === "search") {
    const started = Date.now();
    const records2 = loadVisibleRecords(cwd, homeDir, opts.visibility ?? "all");
    const results = searchRecords(opts.query, records2, opts.limit ?? 5);
    appendMetric(cwd, now, {
      operation: "search",
      status: results.length > 0 ? "ok" : "empty",
      latencyMs: Date.now() - started,
      query: opts.query,
      recordingId: results[0]?.record.id,
      score: results[0]?.score,
      sourceReference: results[0]?.record.source,
      fullTranscriptIncluded: false
    });
    return {
      kind: "search",
      query: opts.query,
      results
    };
  }
  if (opts.action === "inject") {
    const started = Date.now();
    const records2 = loadVisibleRecords(cwd, homeDir, opts.visibility ?? "all");
    const results = searchRecords(opts.query, records2, opts.limit ?? 3, Boolean(opts.expandTranscript));
    const text = formatRecordingMemoryInjection(results, opts.expandTranscript);
    const tokenCount = estimateRecordingTokens(text);
    appendMetric(cwd, now, {
      operation: "inject",
      status: results.length > 0 ? "ok" : "empty",
      latencyMs: Date.now() - started,
      query: opts.query,
      recordingId: results[0]?.record.id,
      score: results[0]?.score,
      sourceReference: results[0]?.record.source,
      injectionTokens: tokenCount,
      fullTranscriptIncluded: Boolean(opts.expandTranscript)
    });
    return {
      kind: "inject",
      text,
      match: results[0],
      tokenCount,
      fullTranscriptIncluded: Boolean(opts.expandTranscript)
    };
  }
  if (opts.action === "metrics") {
    return {
      kind: "metrics",
      summary: summarizeRecordingMetrics(loadRecordingMetrics(cwd))
    };
  }
  if (opts.action === "benchmark") {
    return await runRecordingBenchmark({ cwd, homeDir, now, reportPath: opts.reportPath });
  }
  const records = loadVisibleRecords(cwd, homeDir, "all");
  const record = records.find((r) => r.id === opts.id);
  return {
    kind: "show",
    record: record ? sanitizeRecord(record, opts.expandTranscript) : void 0
  };
}
async function retrieveRecordingMemoriesForPrompt(args) {
  const result = await executeRecording({
    action: "inject",
    query: args.userMessage,
    cwd: args.cwd,
    homeDir: args.homeDir,
    limit: args.limit ?? 3
  });
  const matches = result.kind === "inject" && result.match ? [result.match].filter((r) => !args.sessionSeenIds.has(r.record.id)) : [];
  return {
    matches,
    injectedIds: matches.map((m) => m.record.id),
    injectionText: matches.length > 0 ? formatRecordingMemoryInjection(matches) : "",
    injectionTokens: result.kind === "inject" ? result.tokenCount : 0
  };
}
function formatRecordingMemoryInjection(matches, includeTranscript = false) {
  if (matches.length === 0) return "";
  const lines = ["\u25C8 TeamAgent Recording Memory \u76F8\u5173\u5F55\u97F3"];
  for (const match of matches) {
    const r = match.record;
    lines.push(
      `- ${r.title} (${r.visibility})`,
      `  \u6458\u8981: ${r.summary.slice(0, 220)}`,
      `  \u6765\u6E90: ${r.source}`,
      `  \u4E0A\u4F20\u4EBA: ${r.uploadedBy}`,
      `  \u9002\u7528\u573A\u666F: ${r.useWhen.slice(0, 180)}`,
      `  \u4E3A\u4EC0\u4E48\u76F8\u5173: ${match.whyRelevant}`,
      includeTranscript && r.transcript ? `  Transcript: ${r.transcript}` : `  \u5C55\u5F00: teamagent recording show ${r.id} --transcript`
    );
  }
  const text = lines.join("\n");
  if (includeTranscript || estimateRecordingTokens(text) <= DEFAULT_MAX_INJECTION_TOKENS) {
    return text;
  }
  return `${text.slice(0, DEFAULT_MAX_INJECTION_TOKENS * 4 - 64).trimEnd()}
[trimmed to ${DEFAULT_MAX_INJECTION_TOKENS} token budget]`;
}
function renderBenchmarkReport(result) {
  const lines = [
    "# Recording Memory Golden Prompt Benchmark",
    "",
    "## Recording Examples",
    "",
    ...GOLDEN_MATERIALS.map((m) => `- ${String(m.title)} (${String(m.source)})`),
    "",
    "## Results",
    "",
    "| # | Prompt | Expected Recording | Actual Recording | Pass | Injection Tokens |",
    "|---|---|---|---|---|---|",
    ...result.rows.map(
      (row, i) => `| ${i + 1} | ${row.prompt.replace(/\|/g, "\\|")} | ${row.expectedId} | ${row.actualId || "(empty)"} | ${row.pass ? "PASS" : "FAIL"} | ${row.injectionTokens} |`
    ),
    "",
    `Pass rate: ${result.passCount}/${result.total}`,
    `Acceptance: ${result.ok ? "PASS" : "FAIL"}`,
    `Default injection budget: ${DEFAULT_MAX_INJECTION_TOKENS} tokens`,
    "Full transcript appears only after explicit expansion with `teamagent recording show <id> --transcript` or `teamagent recording inject --full`.",
    ""
  ];
  return lines.join("\n");
}
async function runRecordingBenchmark(args) {
  const started = Date.now();
  const tmpRoot = import_node_fs11.default.mkdtempSync(import_node_path9.default.join(import_node_os4.default.tmpdir(), "teamagent-recording-bench-"));
  const tmpHome = import_node_fs11.default.mkdtempSync(import_node_path9.default.join(import_node_os4.default.tmpdir(), "teamagent-recording-home-"));
  const idsBySource = /* @__PURE__ */ new Map();
  for (const [index, material] of GOLDEN_MATERIALS.entries()) {
    const filePath2 = import_node_path9.default.join(tmpRoot, `recording-${index}.json`);
    import_node_fs11.default.writeFileSync(filePath2, JSON.stringify(material, null, 2), "utf-8");
    const imported = await executeRecording({
      action: "import",
      filePath: filePath2,
      cwd: tmpRoot,
      homeDir: tmpHome,
      now: args.now,
      idGen: () => `golden-${index + 1}`
    });
    if (imported.kind === "import") idsBySource.set(imported.record.source, imported.record.id);
  }
  const evaluatedRows = [];
  for (const item of GOLDEN_PROMPTS) {
    const expectedId = idsBySource.get(item.expectedSource) ?? "";
    const injected = await executeRecording({
      action: "inject",
      query: item.prompt,
      cwd: tmpRoot,
      homeDir: tmpHome,
      now: args.now
    });
    const actualId = injected.kind === "inject" ? injected.match?.record.id ?? "" : "";
    const injectionTokens = injected.kind === "inject" ? injected.tokenCount : 0;
    evaluatedRows.push({
      prompt: item.prompt,
      expectedId,
      actualId,
      pass: actualId === expectedId && injectionTokens <= DEFAULT_MAX_INJECTION_TOKENS,
      injectionTokens
    });
  }
  const passCount = evaluatedRows.filter((r) => r.pass).length;
  const result = {
    kind: "benchmark",
    ok: passCount >= 8,
    passCount,
    total: evaluatedRows.length,
    reportPath: args.reportPath ?? import_node_path9.default.join(args.cwd, "docs", "verification", "recording-memory-golden-benchmark.md"),
    rows: evaluatedRows
  };
  import_node_fs11.default.mkdirSync(import_node_path9.default.dirname(result.reportPath), { recursive: true });
  import_node_fs11.default.writeFileSync(result.reportPath, renderBenchmarkReport(result), "utf-8");
  appendMetric(args.cwd, args.now, {
    operation: "benchmark",
    status: result.ok ? "ok" : "failed",
    latencyMs: Date.now() - started,
    injectionTokens: Math.max(...evaluatedRows.map((r) => r.injectionTokens)),
    fullTranscriptIncluded: false,
    error: result.ok ? void 0 : `passCount=${passCount}`
  });
  return result;
}

// ../cli/src/session-rule-injected.ts
init_cjs_shims();
var import_node_fs12 = require("fs");
var import_node_path10 = __toESM(require("path"), 1);
function filePath(sessionsDir, sessionId) {
  return import_node_path10.default.join(sessionsDir, `${sessionId}_session_injected.json`);
}
function readSessionInjected(sessionsDir, sessionId) {
  const fp = filePath(sessionsDir, sessionId);
  if (!(0, import_node_fs12.existsSync)(fp)) return /* @__PURE__ */ new Set();
  try {
    const parsed = JSON.parse((0, import_node_fs12.readFileSync)(fp, "utf-8"));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function isFirstPrompt(sessionsDir, sessionId) {
  return !(0, import_node_fs12.existsSync)(filePath(sessionsDir, sessionId));
}
function appendSessionInjected(sessionsDir, sessionId, ids) {
  if (ids.length === 0) return;
  const fp = filePath(sessionsDir, sessionId);
  const existing = readSessionInjected(sessionsDir, sessionId);
  for (const id of ids) existing.add(id);
  try {
    (0, import_node_fs12.mkdirSync)(sessionsDir, { recursive: true });
    (0, import_node_fs12.writeFileSync)(fp, JSON.stringify([...existing]));
  } catch {
  }
}
function touchSessionInjected(sessionsDir, sessionId) {
  const fp = filePath(sessionsDir, sessionId);
  if ((0, import_node_fs12.existsSync)(fp)) return;
  try {
    (0, import_node_fs12.mkdirSync)(sessionsDir, { recursive: true });
    (0, import_node_fs12.writeFileSync)(fp, "[]");
  } catch {
  }
}

// ../cli/src/hook-shell/index.ts
init_cjs_shims();
var fs14 = __toESM(require("fs"), 1);
var os6 = __toESM(require("os"), 1);
var path15 = __toESM(require("path"), 1);

// ../cli/src/hook-shell/conditional-gate.ts
init_cjs_shims();

// ../cli/src/hook-shell/index.ts
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (raw.length === 0) return null;
  return JSON.parse(raw);
}
function parseVisibility(env) {
  const raw = (env.TEAMAGENT_VISIBILITY ?? "verbose").toLowerCase();
  return raw === "silent" || raw === "smart" || raw === "verbose" ? raw : "verbose";
}
function shouldShowVerboseHookOutput(env) {
  const raw = env.TEAMAGENT_HOOK_VERBOSE;
  return raw === "1" || raw === "true";
}
function effectiveHookVisibility(visibility, env) {
  if (visibility === "verbose" && !shouldShowVerboseHookOutput(env)) {
    return "smart";
  }
  return visibility;
}
function resolvePaths(cwd, home) {
  const projectRoot2 = findTeamagentRoot(cwd) ?? cwd;
  return {
    projectDbPath: path15.join(projectRoot2, ".teamagent", "knowledge.db"),
    globalDbPath: path15.join(home, ".teamagent", "global.db"),
    eventsDbPath: path15.join(home, ".teamagent", "events.db")
  };
}
function ensureDirsForPaths(paths) {
  for (const p of [paths.projectDbPath, paths.globalDbPath, paths.eventsDbPath]) {
    fs14.mkdirSync(path15.dirname(p), { recursive: true });
  }
}
function makeMirror(env) {
  return (text) => {
    if (env.TEAMAGENT_HOOK_STDERR === "0") return;
    if (typeof text !== "string" || text.length === 0) return;
    try {
      process.stderr.write(`${text}
`);
    } catch {
    }
  };
}
function logFallback(channel, phase, err) {
  try {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`teamagent ${channel}-hook: ${phase}: ${msg}
`);
  } catch {
  }
}
function writeStdout(payload) {
  if (payload === void 0) return;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  try {
    process.stdout.write(text);
  } catch {
  }
}
function closeIfPresent(resource) {
  if (!resource) return;
  try {
    resource.close();
  } catch {
  }
}
function exitZero() {
  process.exit(0);
}
function resolveRuntime(rawCwd) {
  const env = process.env;
  const home = env.TEAMAGENT_HOME && env.TEAMAGENT_HOME.length > 0 ? env.TEAMAGENT_HOME : os6.homedir();
  const claudeProjectDir = env.CLAUDE_PROJECT_DIR;
  const cwdInput = typeof rawCwd === "string" && rawCwd.length > 0 ? rawCwd : claudeProjectDir && claudeProjectDir.length > 0 ? claudeProjectDir : process.cwd();
  const cwd = normalizeCwd(cwdInput);
  const paths = resolvePaths(cwd, home);
  return { cwd, home, env, paths };
}
function pickRawCwd(raw) {
  if (raw && typeof raw === "object" && "cwd" in raw) {
    return raw.cwd;
  }
  return void 0;
}
async function runHook(opts) {
  let raw = null;
  try {
    raw = await readStdinJson();
  } catch (err) {
    logFallback(opts.channel, "stdin parse", err);
    return exitZero();
  }
  let input;
  try {
    input = opts.parseInput(raw);
  } catch (err) {
    logFallback(opts.channel, "parseInput", err);
    return exitZero();
  }
  if (input === null) return exitZero();
  const rt = resolveRuntime(pickRawCwd(raw));
  let store = null;
  let eventLog = null;
  let dirsEnsured = false;
  const ensureDirsOnce = () => {
    if (dirsEnsured) return;
    ensureDirsForPaths(rt.paths);
    dirsEnsured = true;
  };
  try {
    const bus = new InMemoryAttributionBus();
    const visibility = parseVisibility(rt.env);
    const mirror = makeMirror(rt.env);
    const effectiveVisibility = effectiveHookVisibility(visibility, rt.env);
    const renderer = new StdoutRenderer();
    const unsubscribeRenderer = bus.subscribe((event) => {
      if (effectiveVisibility === "silent") return;
      const text = renderer.render([event], effectiveVisibility);
      if (text && text.length > 0) {
        try {
          process.stderr.write(`${text}
`);
        } catch {
        }
      }
    });
    const ctx = {
      input,
      cwd: rt.cwd,
      home: rt.home,
      env: rt.env,
      paths: rt.paths,
      bus,
      visibility: effectiveVisibility,
      mirrorSystemMessage: mirror
    };
    Object.defineProperty(ctx, "store", {
      enumerable: false,
      configurable: false,
      get() {
        if (store === null) {
          ensureDirsOnce();
          store = new DualLayerStore({
            projectDbPath: rt.paths.projectDbPath,
            userGlobalDbPath: rt.paths.globalDbPath
          });
        }
        return store;
      }
    });
    Object.defineProperty(ctx, "eventLog", {
      enumerable: false,
      configurable: false,
      get() {
        if (eventLog === null) {
          ensureDirsOnce();
          eventLog = new SqliteEventLog(openDb(rt.paths.eventsDbPath));
        }
        return eventLog;
      }
    });
    try {
      const out = await opts.handler(ctx);
      const wrapped = opts.envelope && out !== void 0 ? opts.envelope(out) : out;
      writeStdout(wrapped);
    } finally {
      unsubscribeRenderer();
    }
  } catch (err) {
    logFallback(opts.channel, "handler", err);
  } finally {
    closeIfPresent(store);
    closeIfPresent(eventLog);
  }
  return exitZero();
}

// ../cli/src/daemon-first-embedder.ts
init_cjs_shims();
var import_node_child_process4 = require("child_process");
var import_node_fs15 = __toESM(require("fs"), 1);
var import_node_path12 = __toESM(require("path"), 1);
var import_node_os6 = __toESM(require("os"), 1);

// ../cli/src/embedder-client.ts
init_cjs_shims();
var import_node_http = __toESM(require("http"), 1);

// ../cli/src/embedder-state.ts
init_cjs_shims();
var import_node_fs13 = __toESM(require("fs"), 1);
var import_node_path11 = __toESM(require("path"), 1);
var import_node_os5 = __toESM(require("os"), 1);
var EMBEDDER_STATE_FILENAME = ".embedder-state.json";
function defaultEmbedderStatePath(homeDir = import_node_os5.default.homedir()) {
  return import_node_path11.default.join(homeDir, ".teamagent", EMBEDDER_STATE_FILENAME);
}
function readEmbedderState(filePath2) {
  try {
    if (!import_node_fs13.default.existsSync(filePath2)) return null;
    const raw = import_node_fs13.default.readFileSync(filePath2, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.status !== "string" || typeof parsed.pid !== "number" || typeof parsed.port !== "number" || typeof parsed.started_at !== "string" || typeof parsed.model !== "string" || !Array.isArray(parsed.members)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function isDaemonPidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = err.code;
    if (code === "EPERM") return true;
    return false;
  }
}
function describeDaemonReadiness(filePath2) {
  const raw = (() => {
    try {
      return import_node_fs13.default.existsSync(filePath2) ? import_node_fs13.default.readFileSync(filePath2, "utf-8") : null;
    } catch {
      return null;
    }
  })();
  if (raw === null) {
    return { ready: false, reason: "missing", state: null };
  }
  const state = readEmbedderState(filePath2);
  if (!state) {
    return { ready: false, reason: "malformed", state: null };
  }
  if (state.status === "failed") {
    return { ready: false, reason: "failed", state };
  }
  if (state.status === "exiting") {
    return { ready: false, reason: "exiting", state };
  }
  if (!isDaemonPidAlive(state.pid)) {
    return { ready: false, reason: "stale_pid", state };
  }
  if (state.status === "starting") {
    return { ready: false, reason: "starting", state };
  }
  if (!Number.isInteger(state.port) || state.port <= 0) {
    return { ready: false, reason: "no_port", state };
  }
  return { ready: true, reason: "ready", state };
}

// ../cli/src/embedder-client.ts
var DEFAULT_TIMEOUT_MS = 200;
async function embedViaDaemon(texts, opts = {}) {
  if (texts.length === 0) return [];
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  const readiness = describeDaemonReadiness(statePath);
  if (!readiness.ready || !readiness.state) return null;
  const port = readiness.state.port;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ texts });
  return new Promise((resolve2) => {
    const req = import_node_http.default.request(
      {
        host: "127.0.0.1",
        port,
        path: "/embed",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString()
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve2(null);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (Array.isArray(parsed?.vectors)) {
              resolve2(parsed.vectors);
            } else {
              resolve2(null);
            }
          } catch {
            resolve2(null);
          }
        });
        res.on("error", () => resolve2(null));
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve2(null);
    });
    req.on("error", () => resolve2(null));
    req.write(body);
    req.end();
  });
}

// ../cli/src/embedder-spawn-lock.ts
init_cjs_shims();
var import_node_fs14 = __toESM(require("fs"), 1);
var DEFAULT_STALE_MS = 3e4;
function tryAcquireSpawnLock(lockPath, staleMs = DEFAULT_STALE_MS) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = import_node_fs14.default.openSync(lockPath, "wx");
      try {
        import_node_fs14.default.writeSync(fd, `${process.pid}
${(/* @__PURE__ */ new Date()).toISOString()}
`);
      } finally {
        import_node_fs14.default.closeSync(fd);
      }
      return {
        path: lockPath,
        release: () => {
          try {
            import_node_fs14.default.unlinkSync(lockPath);
          } catch {
          }
        }
      };
    } catch (err) {
      const code = err.code;
      if (code !== "EEXIST") return null;
      if (attempt === 0) {
        try {
          const stat = import_node_fs14.default.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > staleMs) {
            try {
              import_node_fs14.default.unlinkSync(lockPath);
            } catch {
            }
            continue;
          }
        } catch {
        }
      }
      return null;
    }
  }
  return null;
}

// ../cli/src/lib/node-sqlite-flags.ts
init_cjs_shims();
var NODE_SQLITE_FLAGS = [
  "--experimental-sqlite",
  "--no-warnings"
];
var NODE_SQLITE_FLAGS_STR = NODE_SQLITE_FLAGS.join(" ");

// ../cli/src/daemon-first-embedder.ts
var DEFAULT_MODEL = "Xenova/multilingual-e5-small";
var DEFAULT_DIM = 384;
var DaemonFirstEmbedder = class {
  modelId;
  dim;
  statePath;
  timeoutMs;
  autoSpawn;
  spawnAttempted = false;
  constructor(opts = {}) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.dim = opts.dim ?? DEFAULT_DIM;
    this.statePath = opts.statePath ?? defaultEmbedderStatePath();
    this.timeoutMs = opts.timeoutMs ?? 200;
    this.autoSpawn = opts.autoSpawn ?? true;
  }
  async embed(texts) {
    if (texts.length === 0) return [];
    const fromDaemon = await embedViaDaemon(texts, {
      statePath: this.statePath,
      timeoutMs: this.timeoutMs
    });
    if (fromDaemon) return fromDaemon;
    if (this.autoSpawn && !this.spawnAttempted) {
      this.spawnAttempted = true;
      tryDetachedSpawn(this.statePath);
    }
    return texts.map(() => []);
  }
};
function tryDetachedSpawn(statePath) {
  try {
    const r = describeDaemonReadiness(statePath);
    if (r.ready) return;
    const s = readEmbedderState(statePath);
    if (s && s.status === "starting") return;
    const binPath = resolveEmbedderBin();
    if (!binPath) return;
    const lock = tryAcquireSpawnLock(`${statePath}.spawn.lock`);
    if (!lock) return;
    try {
      const r2 = describeDaemonReadiness(statePath);
      if (r2.ready) return;
      const s2 = readEmbedderState(statePath);
      if (s2 && s2.status === "starting") return;
      const child = (0, import_node_child_process4.spawn)(
        process.execPath,
        [...NODE_SQLITE_FLAGS, binPath, "--state-path", statePath],
        {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        }
      );
      child.unref();
    } finally {
      lock.release();
    }
  } catch {
  }
}
function resolveEmbedderBin() {
  const override = process.env["TEAMAGENT_EMBEDDER_BIN"];
  if (override && import_node_fs15.default.existsSync(override)) return override;
  const candidates = [
    // POSIX npm -g installed alongside teamagent CLI
    import_node_path12.default.join(import_node_os6.default.homedir(), ".local", "lib", "teamagent", "dist", "bin-embedder.cjs"),
    // monorepo dev: cli/dist
    import_node_path12.default.resolve(process.cwd(), "packages", "cli", "dist", "bin-embedder.cjs"),
    // hooks staged in ~/.teamagent/hooks/
    import_node_path12.default.join(import_node_os6.default.homedir(), ".teamagent", "hooks", "bin-embedder.cjs")
  ];
  const appData = process.env["APPDATA"];
  if (appData) {
    candidates.push(
      import_node_path12.default.join(appData, "npm", "node_modules", "teamagent", "dist", "bin-embedder.cjs")
    );
  }
  const localAppData = process.env["LOCALAPPDATA"];
  if (localAppData) {
    candidates.push(
      import_node_path12.default.join(localAppData, "npm", "node_modules", "teamagent", "dist", "bin-embedder.cjs")
    );
  }
  for (const c of candidates) {
    try {
      if (import_node_fs15.default.existsSync(c)) return c;
    } catch {
    }
  }
  try {
    const req = typeof require !== "undefined" ? require : null;
    if (req) {
      const pkgJson = req.resolve("teamagent/package.json");
      const candidate = import_node_path12.default.join(import_node_path12.default.dirname(pkgJson), "dist", "bin-embedder.cjs");
      if (import_node_fs15.default.existsSync(candidate)) return candidate;
    }
  } catch {
  }
  return null;
}

// ../cli/src/bin-user-prompt-submit.ts
armHookBootstrap();
var HOOK_TIMEOUT_MS = 5e3;
var _embedder = null;
function getEmbedder() {
  if (!_embedder) _embedder = new DaemonFirstEmbedder();
  return _embedder;
}
function stamp() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
async function main() {
  await runHook({
    channel: "UserPromptSubmit",
    parseInput: (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw;
      const prompt = typeof obj.prompt === "string" ? obj.prompt : "";
      if (!prompt) return null;
      const sessionId = typeof obj.session_id === "string" ? obj.session_id : void 0;
      return { prompt, session_id: sessionId };
    },
    handler: async (ctx) => {
      if (ctx.env.TEAMAGENT_DISABLED === "1") {
        return void 0;
      }
      const { input, cwd, home, env, paths, bus } = ctx;
      const prompt = input.prompt;
      const sessionId = input.session_id ?? "";
      const sessionsDir = import_node_path13.default.join(home, ".teamagent", "sessions");
      const eventLog = ctx.eventLog;
      const store = ctx.store;
      const blocks = [];
      if (sessionId) {
        try {
          const { text: injText, injectedIds } = buildInjectionFromPending({
            sessionsDir,
            sessionId
          });
          if (injText) blocks.push(injText);
          const rules = store.findActive();
          const userHits = scanUserInput(prompt, rules);
          const flagText = formatUserInputFlag(userHits);
          if (flagText) blocks.push(flagText);
          persistLastInjected(sessionsDir, sessionId, injectedIds);
          if (injectedIds.length > 0 || userHits.length > 0) {
            const now = (/* @__PURE__ */ new Date()).toISOString();
            if (injectedIds.length > 0) {
              eventLog.append({
                id: `e-inject-${sessionId}-${stamp()}`,
                kind: "ai.narrative.injected",
                knowledge_ids: injectedIds,
                session_id: sessionId,
                timestamp: now,
                schema_version: 1
              });
              const event = {
                kind: "user-prompt.injected",
                source: "hook-user-prompt",
                injectedIds,
                severity: "info",
                timestamp: now
              };
              bus.emit(event);
            }
            for (const h of userHits) {
              eventLog.append({
                id: `e-uflag-${sessionId}-${h.knowledge_id}-${stamp()}`,
                kind: "ai.user_input.flagged",
                knowledge_id: h.knowledge_id,
                session_id: sessionId,
                timestamp: now,
                schema_version: 1
              });
              eventLog.append({
                id: `e-ureject-${sessionId}-${h.knowledge_id}-${stamp()}`,
                kind: "calibrator.user_reject",
                knowledge_id: h.knowledge_id,
                session_id: sessionId,
                timestamp: now,
                schema_version: 1
              });
              const event = {
                kind: "user-prompt.flagged",
                source: "hook-user-prompt",
                ruleId: h.knowledge_id,
                severity: "warning",
                timestamp: now
              };
              bus.emit(event);
            }
          }
        } catch {
        }
      }
      const dailyDisabled = env.TEAMAGENT_DAILY_DISABLED === "1";
      const dailyMatch = matchPrompt(prompt, {
        disabled: dailyDisabled,
        extraTriggers: parseExtraTriggersEnv(env.TEAMAGENT_DAILY_TRIGGERS)
      });
      if (dailyMatch.fire) {
        try {
          const dailyOut = executeDaily({
            cwd,
            homeDir: home,
            projectsRoot: import_node_path13.default.join(home, ".claude", "projects"),
            archive: true,
            format: "context",
            triggeredBy: dailyMatch.reason
          });
          const out2 = {
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: [...blocks, dailyOut.contextMarkdown].join("\n\n")
            }
          };
          return out2;
        } catch {
        }
      }
      let matchedTier1 = [];
      let matchedTier2 = [];
      if (sessionId && prompt) {
        try {
          const seenIds = readSessionInjected(sessionsDir, sessionId);
          const firstPrompt = isFirstPrompt(sessionsDir, sessionId);
          const ruleResult = await Promise.race([
            retrieveRulesForPrompt({
              userMessage: prompt,
              cwd,
              projectDbPath: paths.projectDbPath,
              globalDbPath: paths.globalDbPath,
              sessionSeenIds: seenIds,
              isFirstPrompt: firstPrompt,
              embedder: getEmbedder()
            }),
            new Promise(
              (resolve2) => setTimeout(() => resolve2(null), HOOK_TIMEOUT_MS)
            )
          ]);
          if (ruleResult) {
            if (ruleResult.injectionText) {
              blocks.push(ruleResult.injectionText);
            }
            matchedTier1 = ruleResult.tier1Rules;
            matchedTier2 = ruleResult.tier2Rules;
            if (ruleResult.allInjectedIds.length > 0) {
              appendSessionInjected(
                sessionsDir,
                sessionId,
                ruleResult.allInjectedIds
              );
            } else if (firstPrompt) {
              touchSessionInjected(sessionsDir, sessionId);
            }
          }
        } catch {
        }
      }
      if (sessionId && prompt) {
        try {
          const seenIds = readSessionInjected(sessionsDir, sessionId);
          const recordingResult = await Promise.race([
            retrieveRecordingMemoriesForPrompt({
              userMessage: prompt,
              cwd,
              homeDir: home,
              sessionSeenIds: seenIds
            }),
            new Promise(
              (resolve2) => setTimeout(() => resolve2(null), HOOK_TIMEOUT_MS)
            )
          ]);
          if (recordingResult?.injectionText) {
            blocks.push(recordingResult.injectionText);
          }
          if (recordingResult && recordingResult.injectedIds.length > 0) {
            appendSessionInjected(
              sessionsDir,
              sessionId,
              recordingResult.injectedIds
            );
          }
        } catch {
        }
      }
      if (blocks.length === 0) return void 0;
      const injectionText = blocks.join("\n\n");
      const rawVis = (env.TEAMAGENT_VISIBILITY ?? "verbose").toLowerCase();
      const terminalSummary = rawVis !== "silent" ? buildTerminalSummary(matchedTier1, matchedTier2) : "";
      if (terminalSummary) ctx.mirrorSystemMessage(terminalSummary);
      const out = terminalSummary ? {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: injectionText
        },
        systemMessage: terminalSummary
      } : {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: injectionText
        }
      };
      return out;
    }
  });
}
void main();
