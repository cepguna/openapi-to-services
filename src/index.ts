// index.ts
import {
  toCamelCase,
  toKebabCase,
  toPascalCase,
  fetchOpenapiSchema,
  extractText,
  REPLACE_RESPONSE_LIST,
  REPLACE_RESPONSE_DETAIL,
  REPLACE_RESPONSE_UPDATE,
  REPLACE_RESPONSE_CREATE,
} from './utils';
import { generateHookFunctionApi } from './generate-hook-api';
import { generateFunctionApi } from './generate-function-api';
import { jsonSchemaToTsInterface } from './generate-interface';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface OpenApiData {
  components?: { schemas?: Record<string, any> };
  paths?: Record<string, any>;
}

interface PathInfo {
  method: string;
  url: string;
  operation_id: string;
  response_type: string;
  request_type: string;
  summary: string;
  parameters?: any[];
}

interface ServiceConfig {
  name: string;
  hooks: [string, string][];
}

export async function generateFilesFromOpenapi(
  openapiData: OpenApiData | string,
  outputDir: string,
  outputDirTypes: string,
  outputConfigJson: string,
): Promise<void> {
  /**
   * Generates folder structure and files based on OpenAPI tags.
   * Resolves references and extracts specific types into .d.ts files.
   * Handles nested references and properties like `data`.
   *
   * @param openapiData - Path to OpenAPI JSON file or parsed data
   * @param outputDir - Directory for generated files
   * @param outputDirTypes - Directory for type definitions
   * @param outputConfigJson - Directory for service config
   */
  const data = await parseOpenApiData(openapiData);
  const schemas = data?.components?.schemas ?? {};

  // Resolve $ref recursively
  const resolveRef = (ref: string): any => {
    const refParts = ref.split('/');
    const refName = refParts[refParts.length - 1] || '';
    const schema = schemas[refName] ?? {};
    if ('allOf' in schema) {
      return schema.allOf.reduce(
        (acc: any, item: any) => ({
          ...acc,
          ...('$ref' in item ? resolveRef(item.$ref) : item),
          properties: {
            ...acc.properties,
            ...('$ref' in item ? resolveRef(item.$ref).properties : item.properties),
          },
          required: [
            ...(acc.required || []),
            ...('$ref' in item ? resolveRef(item.$ref).required || [] : item.required || []),
          ],
        }),
        {},
      );
    }
    return schema;
  };

  const generateFunctionName = (summary: string): string =>
    toCamelCase(
      summary.toLowerCase().replace('request', '').replace('endpoint', '').replace('fetch', 'get').replace(' ', '_'),
    );

  // Group paths by tag and collect references
  const { tagGroups, tagReferences } = groupPathsByTag(data, resolveRef);

  // Generate query types
  await generateQueryTypes(tagGroups, outputDirTypes, generateFunctionName);

  // Generate service config
  await generateServiceConfig(tagGroups, outputConfigJson, generateFunctionName);

  // Generate files for each tag
  await generateTagFiles(tagGroups, tagReferences, outputDir, schemas, resolveRef, generateFunctionName);
}

async function parseOpenApiData(openapiData: OpenApiData | string): Promise<OpenApiData> {
  if (typeof openapiData === 'string') {
    const fileContent = await fs.readFile(openapiData, {
      encoding: 'utf-8',
    });
    return JSON.parse(fileContent);
  }
  return openapiData;
}

function groupPathsByTag(data: OpenApiData, resolveRef: (ref: string) => any) {
  const tagGroups: Record<string, PathInfo[]> = {};
  const tagReferences: Record<string, Set<string>> = {};

  console.log('Grouping paths by tag...');
  console.log('Available paths:', Object.keys(data?.paths ?? {}));

  for (const [pathKey, methods] of Object.entries(data?.paths ?? {})) {
    console.log(`Processing path: ${pathKey}`);

    for (const [method, methodDataX] of Object.entries(methods)) {
      const methodData: any = methodDataX;
      const tags = methodData.tags ?? [];

      console.log(`  Method: ${method}, Tags: ${tags}`);

      if (tags.length === 0) {
        console.log(`    Skipping ${method} ${pathKey} - no tags`);
        continue;
      }

      const tag = tags[0];
      tagGroups[tag] = tagGroups[tag] ?? [];
      tagReferences[tag] = tagReferences[tag] ?? new Set();

      // Collect all $ref from response schema
      const responseStatus = method === 'post' ? '201' : method === 'delete' ? '204' : '200';
      const responseSchema = methodData?.responses?.[responseStatus]?.content?.['application/json']?.schema ?? {};
      const responseRefs = collectRefs(responseSchema);
      responseRefs.forEach((ref) => tagReferences[tag].add(ref));

      // Collect all $ref from request body schema across content types
      const contentTypes = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'];
      let requestRef: string | undefined;
      for (const contentType of contentTypes) {
        const requestSchema = methodData?.requestBody?.content?.[contentType]?.schema;
        if (requestSchema) {
          const refs = collectRefs(requestSchema);
          refs.forEach((ref) => tagReferences[tag].add(ref));
          if (!requestRef && '$ref' in requestSchema) {
            requestRef = requestSchema.$ref.split('/').pop() || '';
          }
        }
      }

      const pathInfo: PathInfo = {
        method,
        url: pathKey,
        operation_id: methodData.operationId,
        response_type: responseRefs.length > 0 ? responseRefs[0].split('/').pop() || '' : '',
        request_type: requestRef || '',
        summary: methodData.summary || `${method} ${pathKey}`,
        parameters: methodData.parameters,
      };

      tagGroups[tag].push(pathInfo);
      console.log(`    Added to tag '${tag}': ${pathInfo.summary}`);
    }
  }

  console.log('Final tag groups:', Object.keys(tagGroups));
  return { tagGroups, tagReferences };
}

// Helper to collect all $ref from a schema
function collectRefs(schema: any): string[] {
  const refs: string[] = [];
  if (!schema) return refs;

  if ('$ref' in schema) {
    refs.push(schema.$ref);
  }
  if ('allOf' in schema) {
    schema.allOf?.forEach((item: any) => refs.push(...collectRefs(item)));
  }
  if ('items' in schema) {
    refs.push(...collectRefs(schema.items));
  }
  if ('properties' in schema) {
    Object.values(schema.properties).forEach((prop: any) => refs.push(...collectRefs(prop)));
  }
  return refs;
}

async function generateQueryTypes(
  tagGroups: Record<string, PathInfo[]>,
  outputDirTypes: string,
  generateFunctionName: (summary: string) => string,
) {
  const tagNames = new Set<string>();
  for (const [tag, paths] of Object.entries(tagGroups)) {
    if (tag === 'api' || tag === 'App') continue;
    for (const path of paths) {
      const firstSummary = path.summary.split(' ').slice(-2)[0].replace('_', '-');
      tagNames.add(tag);
    }
  }

  const textFile = `export type TQueryKeyGenerated =\n${[...tagNames].map((tag) => `  | '${tag}'`).join('\n')};\n`;
  const folderPath = path.join(outputDirTypes);
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(folderPath, 'query-types-generated.d.ts'), `// Auto-generated file\n${textFile}`, {
    encoding: 'utf-8',
  });
}

async function generateServiceConfig(
  tagGroups: Record<string, PathInfo[]>,
  outputConfigJson: string,
  generateFunctionName: (summary: string) => string,
) {
  const services: ServiceConfig[] = Object.entries(tagGroups)
    .filter(([tag]) => tag !== 'api')
    .map(([tag, paths]) => ({
      name: toKebabCase(tag),
      hooks: [
        ...paths.map((path) => {
          const nameUse = generateFunctionName(`use_${path.summary}`);
          const typeUse =
            path.method === 'delete'
              ? 'string'
              : path.method === 'get'
                ? path.response_type.replace('_for_', '')
                : extractText(path.request_type)
                    .replace('_for_', '')
                    .replace(/[()',\[\]]/g, '');
          return [nameUse, typeUse] as [string, string];
        }),
        [toCamelCase(`useSelect ${tag}`), 'any'],
      ],
    }));

  const serviceJson = `export const serviceJson = ${JSON.stringify(services, null, 2).replace(/"/g, "'")};\n`;
  const folderPath = path.join(outputConfigJson);
  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(path.join(folderPath, 'service.ts'), serviceJson, {
    encoding: 'utf-8',
  });
}

async function generateTagFiles(
  tagGroups: Record<string, PathInfo[]>,
  tagReferences: Record<string, Set<string>>,
  outputDir: string,
  schemas: Record<string, any>,
  resolveRef: (ref: string) => any,
  generateFunctionName: (summary: string) => string,
) {
  for (const [tag, paths] of Object.entries(tagGroups)) {
    if (tag === 'api' || tag === 'App') continue;
    const folderPath = path.join(outputDir, toKebabCase(tag));
    await fs.mkdir(folderPath, { recursive: true });

    // Generate .ts file
    await generateTsFile(tag, paths, folderPath, generateFunctionName);

    // Generate index.ts
    await fs.writeFile(
      path.join(folderPath, 'index.ts'),
      `// Auto-generated file for tag: ${toKebabCase(tag)}
export * from './${toKebabCase(tag)}';
export type * from './types.d.ts';
export * from './use-${toKebabCase(tag)}';
`,
      { encoding: 'utf-8' },
    );

    // Generate .d.ts file
    await generateDtsFile(tag, tagReferences[tag], folderPath, schemas, resolveRef);

    // Generate hook file
    await generateHookFile(tag, paths, folderPath, generateFunctionName);
  }
}

async function generateTsFile(
  tag: string,
  paths: PathInfo[],
  folderPath: string,
  generateFunctionName: (summary: string) => string,
) {
  const uniqueTypes = new Set<string>();
  const importType = `import type {
${paths
  .flatMap((path) => [
    path.request_type ? extractText(path.request_type).replace('_for_', '') : null,
    path.response_type.replace('_for_', ''),
  ])
  .filter((type) => type && !uniqueTypes.has(type) && uniqueTypes.add(type))
  .map((type) => `  ${type}`)
  .join(',\n')}
} from './types';

`;

  const exportName = toPascalCase(`${tag}_service`);
  const uniqueFunctions = new Set<string>();
  const tsFileContent = `// Auto-generated file for tag: ${toKebabCase(tag)}
import { ApiHelper } from '@/utils/api-helper';
import qs from 'query-string';

${importType}${paths
  .map((path) =>
    generateFunctionApi(
      path.method,
      tag,
      path.url,
      generateFunctionName(path.summary),
      path.response_type.replace('_for_', ''),
      extractText(path.request_type).replace('_for_', ''),
      path.parameters,
    ),
  )
  .join('')}

export const ${exportName} = {
${paths
  .map((path) => generateFunctionName(path.summary))
  .filter((funcName) => !uniqueFunctions.has(funcName) && uniqueFunctions.add(funcName))
  .map((funcName) => `  ${funcName}`)
  .join(',\n')}
};
`;

  await fs.writeFile(path.join(folderPath, `${toKebabCase(tag)}.ts`), tsFileContent, { encoding: 'utf-8' });
}

async function generateDtsFile(
  tag: string,
  references: Set<string>,
  folderPath: string,
  schemas: Record<string, any>,
  resolveRef: (ref: string) => any,
) {
  let stringTypes = '';
  const processedRefs = new Set<string>();

  // for (const ref of references) {
  //   const refName = ref.split('/').pop() || '';
  //   if (refName in schemas && !processedRefs.has(ref)) {
  //     const schema = resolveRef(ref);
  //     if (refName.includes('ResponseList') || refName.includes('ResponseSingle')) {
  //       stringTypes += generateResponseInterface(refName, schema, schemas, resolveRef, stringTypes);
  //     } else {
  //       stringTypes += jsonSchemaToTsInterface(refName, schema, stringTypes, schemas);
  //     }
  //     processedRefs.add(ref);
  //   }
  // }

  for (const ref of references) {
    const refName = ref.split('/').pop() || '';
    if (refName in schemas && !processedRefs.has(ref)) {
      const schema = resolveRef(ref);
      // console.log("REFNAME", refName)
      if (refName.includes('Response')) {
        // console.log("TRUE", refName)
        // Recursively collect nested $refs inside this schema
        const nestedRefs = collectRefs(schema);
        nestedRefs.forEach((nestedRef) => {
          if (!references.has(nestedRef)) {
            references.add(nestedRef);
          }
        });
        stringTypes += generateResponseInterface(refName, schema, schemas, resolveRef, stringTypes);
      } else {
        // console.log("FALSE", refName)
        stringTypes += jsonSchemaToTsInterface(refName, schema, stringTypes, schemas) + '\n';
      }
      processedRefs.add(ref);
    }
  }

  await fs.writeFile(
    path.join(folderPath, 'types.d.ts'),
    `// Auto-generated type stubs for tag: ${tag}\n${stringTypes}`,
    { encoding: 'utf-8' },
  );
}

function generateResponseInterface(
  refName: string,
  schema: any,
  schemas: Record<string, any>,
  resolveRef: (ref: string) => any,
  currentString: string,
): string {
  let tsInterface = `export interface ${refName} {\n`;
  let dataType = '';

  // Handle allOf structure from the response schema
  if (schema.allOf) {
    // Find the data override in allOf entries
    const dataOverride = schema.allOf.find((item: any) => item.properties?.data);
    if (dataOverride) {
      const dataSchema = dataOverride.properties.data;
      if (dataSchema.$ref) {
        dataType = dataSchema.$ref.split('/').pop() || 'any'; // e.g., ExampleModel
      } else if (dataSchema.type === 'array' && dataSchema.items?.$ref) {
        dataType = `${dataSchema.items.$ref.split('/').pop() || 'any'}[]`; // e.g., ExampleModel[]
      }
    }

    // Merge properties from allOf, but we'll handle data property specially
    const mergedProperties: any = {};
    const mergedRequired: string[] = [];

    schema.allOf.forEach((item: any) => {
      if (item.$ref) {
        // Resolve the reference and merge its properties
        const resolved = resolveRef(item.$ref);
        Object.assign(mergedProperties, resolved.properties || {});
        if (resolved.required) {
          mergedRequired.push(...resolved.required);
        }
      } else if (item.properties) {
        // This is likely the data override - merge non-data properties
        const { data, ...otherProps } = item.properties;
        Object.assign(mergedProperties, otherProps);
        if (item.required) {
          mergedRequired.push(...item.required.filter((req: string) => req !== 'data'));
        }
      }
    });

    // Override the data property type if we found a data override
    if (dataType && mergedProperties.data) {
      // Keep the original data property structure but we'll use our resolved type
      // Don't modify mergedProperties.data here, we'll handle it in the loop below
    }

    // Set the merged properties back to schema
    schema.properties = mergedProperties;
    schema.required = [...new Set(mergedRequired)]; // Remove duplicates
  }

  // If no override found, check if schema already has data property defined
  if (!dataType && schema.properties?.data) {
    const propDetails = schema.properties.data;
    if (propDetails.$ref) {
      dataType = propDetails.$ref.split('/').pop() || 'any';
    } else if (propDetails.type === 'array' && propDetails.items) {
      // Handle inline array definitions
      if (propDetails.items.$ref) {
        dataType = `${propDetails.items.$ref.split('/').pop() || 'any'}[]`;
      } else {
        // For inline object definitions, we need to find the corresponding model
        // Look for a model that matches the inline definition
        const modelName = refName.replace(REPLACE_RESPONSE_LIST, '');
        if (modelName) {
          dataType = `${modelName}[]`;
        } else {
          dataType = resolvePropertyType('data', propDetails, refName, schemas, currentString, false);
        }
      }
    } else if (propDetails.type === 'object') {
      // For inline object definitions, we need to find the corresponding model
      // Look for a model that matches the inline definition
      const modelName = refName
        .replace(REPLACE_RESPONSE_DETAIL, '')
        .replace(REPLACE_RESPONSE_UPDATE, '')
        .replace(REPLACE_RESPONSE_CREATE, '');
      if (modelName) {
        dataType = `${modelName}`;
      } else {
        dataType = resolvePropertyType('data', propDetails, refName, schemas, currentString, false);
      }
    } else {
      dataType = resolvePropertyType('data', propDetails, refName, schemas, currentString, false);
    }
  }

  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const [propName, propDetails] of Object.entries(properties) as [string, any][]) {
    let propType = '';
    const isRequired = required.includes(propName);
    const isNullable = propDetails.nullable ?? false;

    if (propName === 'data' && dataType) {
      propType = dataType; // Use the overridden or resolved data type
    } else {
      propType = resolvePropertyType(propName, propDetails, refName, schemas, currentString, propName === 'meta');
    }

    // Handle nullable types
    if (isNullable && !propType.includes('null')) {
      propType = `${propType} | null`;
    }

    tsInterface += `  ${propName}${isRequired && !isNullable ? '' : '?'}: ${propType};\n`;
  }

  tsInterface += '}\n\n';
  return tsInterface;
}

// Helper function to find a matching model based on inline object definition
function findMatchingModel(inlineSchema: any, schemas: Record<string, any>): string | null {
  if (!inlineSchema.properties) return null;

  const inlineProps = Object.keys(inlineSchema.properties).sort();
  const inlineRequired = (inlineSchema.required || []).sort();

  for (const [schemaName, schema] of Object.entries(schemas)) {
    if (schemaName.includes('Response') || schemaName.includes('Dto')) continue;

    const schemaProps = Object.keys(schema.properties || {}).sort();
    const schemaRequired = (schema.required || []).sort();

    // Check if properties and required fields match
    if (
      JSON.stringify(inlineProps) === JSON.stringify(schemaProps) &&
      JSON.stringify(inlineRequired) === JSON.stringify(schemaRequired)
    ) {
      return schemaName;
    }
  }

  return null;
}

// Helper to resolve property types
function resolvePropertyType(
  propName: string,
  propDetails: any,
  parentName: string,
  schemas: Record<string, any>,
  currentString: string,
  inlineObject: boolean = false,
): string {
  if (propDetails.$ref) {
    return propDetails.$ref.split('/').pop() || 'any';
  }
  if (propDetails.allOf) {
    return propDetails.allOf
      .filter((item: any) => item.$ref)
      .map((item: any) => item.$ref.split('/').pop() || 'any')
      .join(' & ');
  }
  if (propDetails.type === 'array') {
    const itemsType = resolvePropertyType(
      `${propName}_item`,
      propDetails.items ?? {},
      parentName,
      schemas,
      currentString,
      inlineObject,
    );
    return `${itemsType}[]`;
  }
  if (propDetails.type === 'object' && !inlineObject) {
    const nestedInterfaceName = `${parentName}_${propName}`;
    if (!currentString.includes(`export interface ${nestedInterfaceName}`)) {
      const nestedInterface = jsonSchemaToTsInterface(nestedInterfaceName, propDetails, currentString, schemas);
      if (nestedInterface) {
        return nestedInterfaceName;
      }
    }
    return nestedInterfaceName;
  }
  if (propDetails.type === 'object' && inlineObject) {
    let inlineType = '{';
    const subProperties = propDetails.properties ?? {};
    const subRequired = propDetails.required ?? [];
    for (const [subPropName, subPropDetails] of Object.entries(subProperties) as [string, any][]) {
      const subNullable = subPropDetails.nullable ?? false;
      const subPropType = resolvePropertyType(subPropName, subPropDetails, parentName, schemas, currentString, true);
      inlineType += ` ${subPropName}${subRequired.includes(subPropName) && !subNullable ? '' : '?'}: ${subPropType};`;
    }
    inlineType += ' }';
    return inlineType;
  }
  if (propDetails.enum) {
    return propDetails.enum.map((value: any) => `"${value}"`).join(' | ');
  }
  if (propDetails.type === 'integer') {
    return 'number';
  }
  if (propDetails.type === 'string' && ['date-time', 'partial-date-time'].includes(propDetails.format)) {
    return 'Date';
  }
  return propDetails.type ?? 'any';
}

async function generateHookFile(
  tag: string,
  paths: PathInfo[],
  folderPath: string,
  generateFunctionName: (summary: string) => string,
) {
  const exportName = toPascalCase(`${tag}_service`);
  const uniqueTypes = new Set<string>();
  const importType = `import type {
${paths
  .flatMap((path) => [
    path.request_type ? extractText(path.request_type).replace('_for_', '') : null,
    path.response_type.replace('_for_', ''),
  ])
  .filter((type) => type && !uniqueTypes.has(type) && uniqueTypes.add(type))
  .map((type) => `  ${type}`)
  .join(',\n')}
} from './types';

`;

  const dtsContent = await fs.readFile(path.join(folderPath, 'types.d.ts'), {
    encoding: 'utf-8',
  });
  const pattern = new RegExp(`export interface ${toPascalCase(tag)}Model \\{(.*?)\\}`, 's');
  const match = dtsContent.match(pattern);
  const dtoCode: Record<string, string> = match
    ? match[1]
        .trim()
        .split('\n')
        .reduce(
          (acc, line) => {
            const trimmed = line.trim();
            if (trimmed) {
              const [key, value] = trimmed.split(':').map((s) => s.trim());
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        )
    : {};

  let tagName = '';
  const hookTsContent = `// Auto-generated file for tag: ${tag}
import useAppMutation, { type TMutationOptions } from '@/hooks/use-app-mutation';
import useAppQuery, { type TQueryOptions } from '@/hooks/use-app-query';
import { useEffect, useState } from 'react';
import { ${exportName} } from './${toKebabCase(tag)}';

${importType}${paths
  .map((path) => {
    const firstSummary = path.summary.split(' ').slice(-2)[0];
    if (tagName !== firstSummary) tagName = firstSummary.replace('_', '-');
    return generateHookFunctionApi(
      path.method,
      tag,
      path.url,
      generateFunctionName(`use_${path.summary}`),
      path.response_type.replace('_for_', ''),
      extractText(path.request_type).replace('_for_', ''),
      `${exportName}.${generateFunctionName(path.summary)}`,
      path.parameters,
      dtoCode,
    );
  })
  .join('')}
`;

  await fs.writeFile(path.join(folderPath, `use-${toKebabCase(tag)}.ts`), hookTsContent, { encoding: 'utf-8' });
}

async function main() {
  const prompt = require('prompt-sync')();
  const confirmation = prompt(
    'This action will replace existing folder inside fe-joona-productivity/src/services if the folder already exists? (y/n): ',
  )
    .trim()
    .toLowerCase();

  if (confirmation !== 'y') {
    console.log('Operation aborted.');
    process.exit(0);
  }

  const openapiEndpoint = 'http://localhost:9200/openapi.json';
  const outputDirectory = '../fe-joona-productivity/src/services-generated/';
  const outputDirectoryTypes = '../fe-joona-productivity/src/types/';
  const outputConfigJson = '../fe-joona-productivity/src/config/';

  try {
    const openapiSchema = await fetchOpenapiSchema(openapiEndpoint);
    await generateFilesFromOpenapi(openapiSchema, outputDirectory, outputDirectoryTypes, outputConfigJson);
    console.log('DONE');
    process.exit(0);
  } catch (error) {
    console.error(`Failed to generate files: ${error}`);
    process.exit(1);
  }
}

main();
