#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { access } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = join(ROOT, "tool-manifest.schema.json");
const MANIFEST_FILENAME = "tool-manifest.json";
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "coverage"]);

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

function formatPath(path) {
  return path || "$";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function typeMatches(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function formatValue(value) {
  return JSON.stringify(value);
}

function validateAgainstSchema(value, schema, path = "") {
  const errors = [];

  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${formatPath(path)} must be ${schema.type}, got ${Array.isArray(value) ? "array" : typeof value}`);
    return errors;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${formatPath(path)} must equal ${formatValue(schema.const)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${formatPath(path)} must be one of: ${schema.enum.join(", ")}; got ${formatValue(value)}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${formatPath(path)} must not be empty`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push(`${formatPath(path)} does not match ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${formatPath(path)} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        errors.push(`${formatPath(path)} must not contain duplicate items`);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateAgainstSchema(item, schema.items, `${formatPath(path)}[${index}]`));
      });
    }
  }

  if (isObject(value)) {
    if (schema.required) {
      for (const property of schema.required) {
        if (!Object.hasOwn(value, property)) {
          errors.push(`${formatPath(path)} is missing required property "${property}"`);
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const property of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties, property)) {
          errors.push(`${formatPath(path)} contains unknown property "${property}"`);
        }
      }
    }
    for (const [property, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, property)) {
        errors.push(...validateAgainstSchema(value[property], propertySchema, `${formatPath(path)}.${property}`));
      }
    }
  }

  return errors;
}

async function readJson(path, label) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new ValidationError(`cannot read ${label}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new ValidationError(`invalid JSON in ${label}: ${error.message}`);
  }
}

async function findManifests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        manifests.push(...await findManifests(join(directory, entry.name)));
      }
    } else if (entry.isFile() && entry.name === MANIFEST_FILENAME) {
      manifests.push(join(directory, entry.name));
    }
  }

  return manifests.sort();
}

async function assertFile(path, description, errors) {
  try {
    await access(path);
  } catch {
    errors.push(`${description} does not exist: ${relative(ROOT, path)}`);
  }
}

async function validateManifest(manifestPath, schema) {
  const errors = [];
  let manifest;

  try {
    manifest = await readJson(manifestPath, "tool manifest");
  } catch (error) {
    return [error.message];
  }

  errors.push(...validateAgainstSchema(manifest, schema));
  if (!isObject(manifest)) return errors;

  const packageDirectory = dirname(manifestPath);
  const packageJsonPath = join(packageDirectory, "package.json");
  let packageJson = null;

  try {
    packageJson = await readJson(packageJsonPath, `${relative(ROOT, packageJsonPath)} (manifest package metadata)`);
  } catch (error) {
    errors.push(error.message);
  }

  if (packageJson && isObject(packageJson)) {
    if (manifest.package !== packageJson.name) {
      errors.push(`package must match package.json name (${formatValue(packageJson.name)})`);
    }
    if (manifest.version !== packageJson.version) {
      errors.push(`version must match package.json version (${formatValue(packageJson.version)})`);
    }
  }

  if (typeof manifest.documentation === "string") {
    const documentationPath = resolve(packageDirectory, manifest.documentation);
    const relativeDocumentation = relative(packageDirectory, documentationPath);
    if (relativeDocumentation.startsWith(`..${sep}`) || relativeDocumentation === ".." || relativeDocumentation.startsWith(sep)) {
      errors.push("documentation must stay inside the tool directory");
    } else {
      await assertFile(documentationPath, "documentation", errors);
    }
  }

  if (Array.isArray(manifest.dependencies) && manifest.package && manifest.dependencies.includes(manifest.package)) {
    errors.push("dependencies must not contain the package itself");
  }

  return errors;
}

async function main() {
  let schema;
  try {
    schema = await readJson(SCHEMA_PATH, "tool-manifest.schema.json");
  } catch (error) {
    console.error(`Manifest validation setup failed: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const schemaErrors = validateAgainstSchema(schema, {
    type: "object",
    required: ["$schema", "$id", "title", "type", "required", "properties"],
    properties: {
      "$schema": { type: "string" },
      "$id": { type: "string" },
      "title": { type: "string" },
      "type": { type: "string", const: "object" },
      "required": { type: "array", minItems: 1 },
      "properties": { type: "object" }
    }
  });
  if (schemaErrors.length > 0) {
    console.error("Manifest validation setup failed: the root schema is malformed:");
    for (const error of schemaErrors) console.error(`  - ${error}`);
    process.exitCode = 2;
    return;
  }

  const manifestPaths = await findManifests(ROOT);
  if (manifestPaths.length === 0) {
    console.error(`Manifest validation failed: no ${MANIFEST_FILENAME} files found below the repository root.`);
    process.exitCode = 1;
    return;
  }

  const packageNames = new Map();
  const toolNames = new Map();
  const manifestsByPath = new Map();
  const allErrors = [];
  for (const manifestPath of manifestPaths) {
    const manifestLabel = relative(ROOT, manifestPath);
    const errors = await validateManifest(manifestPath, schema);
    let manifest = null;
    try {
      manifest = await readJson(manifestPath, manifestLabel);
    } catch {
      // The parse error is already included in `errors`.
    }
    if (manifest?.package) {
      const previous = packageNames.get(manifest.package);
      if (previous) {
        errors.push(`${manifestLabel}: package ${manifest.package} is already declared by ${previous}`);
      } else {
        packageNames.set(manifest.package, manifestLabel);
      }
    }
    if (manifest?.name) {
      const previous = toolNames.get(manifest.name);
      if (previous) {
        errors.push(`${manifestLabel}: tool name ${manifest.name} is already declared by ${previous}`);
      } else {
        toolNames.set(manifest.name, manifestLabel);
      }
    }
    manifestsByPath.set(manifestPath, { manifest, errors, manifestLabel });
  }

  const declaredPackages = new Set(packageNames.keys());
  for (const { manifest, errors, manifestLabel } of manifestsByPath.values()) {
    if (!Array.isArray(manifest?.dependencies)) continue;
    for (const dependency of manifest.dependencies) {
      if (!declaredPackages.has(dependency)) {
        errors.push(`${manifestLabel}: dependency ${dependency} does not match a discovered tool manifest`);
      }
    }
  }

  for (const { errors, manifestLabel } of manifestsByPath.values()) {
    if (errors.length > 0) {
      allErrors.push(...errors.map((error) => `${manifestLabel}: ${error}`));
    } else {
      console.log(`✓ ${manifestLabel}`);
    }
  }

  if (allErrors.length > 0) {
    console.error(`Manifest validation failed (${allErrors.length} error${allErrors.length === 1 ? "" : "s"}):`);
    for (const error of allErrors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Validated ${manifestPaths.length} tool manifest${manifestPaths.length === 1 ? "" : "s"}.`);
  process.exitCode = 0;
}

main().catch((error) => {
  console.error(`Manifest validation failed unexpectedly: ${error.stack ?? error.message}`);
  process.exitCode = 2;
});
