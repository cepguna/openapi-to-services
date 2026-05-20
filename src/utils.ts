import axios from 'axios';

export const REPLACE_RESPONSE_LIST = 'ResponseList';
export const REPLACE_RESPONSE_DETAIL = 'ResponseDetail';
export const REPLACE_RESPONSE_UPDATE = 'ResponseUpdate';
export const REPLACE_RESPONSE_CREATE = 'ResponseCreate';

export function toCamelCase(text: string): string {
  /**
   * Transforms a given text into camel case.
   * @param text - The input text to transform
   * @returns The transformed text in camel case
   */
  const words = text.replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return `${words[0]}${words
    .slice(1)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')}`;
}

export function toKebabCase(text: string): string {
  /**
   * Transforms a given text into kebab case.
   * @param text - The input text to transform
   * @returns The transformed text in kebab case
   */
  const words = text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase or PascalCase
    .replace(/[_\s]+/g, ' ') // Replace underscores or spaces
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word) => word.toLowerCase()).join('-');
}

export function toPascalCase(text: string): string {
  /**
   * Converts a given string to Pascal Case.
   * @param text - The input string to convert
   * @returns The PascalCase formatted string
   */
  const words = text.split(/[_\-\s]+/).filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

export async function fetchOpenapiSchema(endpointUrl: string): Promise<any> {
  /**
   * Fetches OpenAPI schema from the given endpoint.
   * @param endpointUrl - The URL of the OpenAPI endpoint
   * @returns The parsed JSON schema
   * @throws Exits the program on failure
   */
  try {
    const response = await axios.get(endpointUrl);
    return response.data;
  } catch (error) {
    console.error(`Request failed: ${error}`);
    console.error('Please ensure the API is running and accessible.');
    process.exit(1);
  }
}

export function extractText(inputText: string): string {
  /**
   * Extracts the portion of the input text after the last '_for_' substring.
   * @param inputText - The input string to extract from
   * @returns The extracted portion or the original string if '_for_' is not found
   */
  return inputText.includes('_for_') ? inputText.split('_for_').pop()! : inputText;
}

export function resolveRef(ref: string, schemas: Record<string, any>): any {
  /**
   * Resolves OpenAPI $ref recursively.
   * @param ref - The reference string (e.g., '#/components/schemas/MySchema')
   * @param schemas - The schemas object from OpenAPI
   * @returns The resolved schema
   */
  const refName = ref.split('/').pop()!;
  const schema = schemas[refName] ?? {};
  if ('allOf' in schema) {
    return schema.allOf.reduce(
      (acc: any, item: any) => ({
        ...acc,
        ...('$ref' in item ? resolveRef(item.$ref, schemas) : item),
      }),
      {},
    );
  }
  return schema;
}

export function collectRefs(schema: any): string[] {
  const refs: string[] = [];
  if (!schema) return refs;

  if ('$ref' in schema) {
    refs.push(schema.$ref);
  }
  if ('allOf' in schema) {
    schema.allOf?.forEach((item: any) => refs.push(...collectRefs(item)));
  }
  if ('anyOf' in schema) {
    schema.anyOf?.forEach((item: any) => refs.push(...collectRefs(item)));
  }
  if ('oneOf' in schema) {
    schema.oneOf?.forEach((item: any) => refs.push(...collectRefs(item)));
  }
  if ('items' in schema) {
    refs.push(...collectRefs(schema.items));
  }
  if ('properties' in schema) {
    Object.values(schema.properties).forEach((prop: any) => refs.push(...collectRefs(prop)));
  }
  return refs;
}
