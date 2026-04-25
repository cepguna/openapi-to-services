import { fetchOpenapiSchema, toCamelCase, resolveRef } from './utils';
import { jsonSchemaToTsInterface } from './generate-interface';

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

function flattenInterfaces(resArray: string[]): string[] {
  /**
   * Flattens a list of TypeScript interface strings into individual interfaces.
   * @param resArray - Array of interface strings
   * @returns Flattened array of individual interfaces
   */
  return resArray.flatMap((data) =>
    data
      .split(/\n\s*\n/)
      .map((i) => i.trim())
      .filter(Boolean),
  );
}

export async function generateFilesFromOpenapi(openapiData: OpenApiData | string, apiTag: string): Promise<string> {
  /**
   * Generates TypeScript interfaces for a specific OpenAPI tag.
   * @param openapiData - Path to OpenAPI JSON file or parsed data
   * @param apiTag - Specific API tag to process
   * @returns Generated TypeScript interface code
   */
  const data =
    typeof openapiData === 'string'
      ? JSON.parse(await (await import('node:fs/promises')).readFile(openapiData, 'utf-8'))
      : openapiData;
  const schemas = data?.components?.schemas ?? {};

  const generateFunctionName = (summary: string) =>
    toCamelCase(
      summary.toLowerCase().replace('request', '').replace('endpoint', '').replace('fetch', 'get').replace(' ', '_'),
    );

  const tagGroups: Record<string, PathInfo[]> = {};
  const tagReferences: Record<string, Set<string>> = {};

  for (const [pathKey, methods] of Object.entries(data?.paths ?? {})) {
    for (const [method, methodData] of Object.entries(methods as any) as any) {
      const tags = methodData.tags ?? [];
      if (!tags.length) continue;

      const tag = tags[0];
      tagGroups[tag] = tagGroups[tag] ?? [];
      tagReferences[tag] = tagReferences[tag] ?? new Set();

      const responseRef = methodData?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
      const requestRef = methodData?.requestBody?.content?.['application/json']?.schema?.$ref;

      tagGroups[tag].push({
        method,
        url: pathKey,
        operation_id: methodData.operationId,
        response_type: responseRef ? responseRef.split('/').pop()! : '',
        request_type: requestRef ? requestRef.split('/').pop()! : '',
        summary: methodData.summary,
        parameters: methodData.parameters,
      });

      const requestBody = methodData?.requestBody?.content?.['application/json']?.schema ?? {};
      if ('$ref' in requestBody) tagReferences[tag].add(requestBody.$ref);

      const responses = methodData?.responses ?? {};
      for (const response of Object.values(responses) as any) {
        const contentSchema = response?.content?.['application/json']?.schema ?? {};
        if ('$ref' in contentSchema) tagReferences[tag].add(contentSchema.$ref);
      }
    }
  }

  let textFile = 'export type TQueryKeyGenerated =\n';
  const tagNames = new Set<string>();
  for (const [tag, paths] of Object.entries(tagGroups)) {
    if (tag === 'api') continue;
    for (const path of paths) {
      const firstSummary = path.summary.split(' ').slice(-2)[0].replace('_', '-');
      tagNames.add(firstSummary);
    }
  }
  textFile += `${[...tagNames].map((tag) => `  | '${tag}'`).join('\n')};\n`;

  let stringTypes = '';
  const resArray: string[] = [];
  for (const [tag, _] of Object.entries(tagGroups)) {
    if (tag === 'api' || tag !== apiTag) continue;

    const processedRefs = new Set<string>();
    for (const ref of tagReferences[tag] ?? []) {
      const refName = ref.split('/').pop()!;
      if (refName in schemas && !processedRefs.has(ref)) {
        const schema = resolveRef(ref, schemas);
        const newType = jsonSchemaToTsInterface(refName, schema, stringTypes, schemas);
        if (newType) {
          stringTypes += newType;
          resArray.push(newType);
        }
        processedRefs.add(ref);
      }
    }
  }

  const flatInterfaces = flattenInterfaces(resArray);
  return flatInterfaces
    .filter(
      (data) => !['responselist', 'responsesingle', 'paginationtype'].some((word) => data.toLowerCase().includes(word)),
    )
    .join('\n\n');
}

// Example usage
if (require.main === module) {
  (async () => {
    const openapiEndpoint = 'http://localhost:8000/openapi.json';
    const apiTag = process.argv[2];
    if (!apiTag) {
      console.error('API tag is required');
      process.exit(1);
    }
    const openapiSchema = await fetchOpenapiSchema(openapiEndpoint);
    const response = await generateFilesFromOpenapi(openapiSchema, apiTag);
    console.log(response);
  })();
}
