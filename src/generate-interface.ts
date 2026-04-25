import {
  extractText,
  resolveRef,
  REPLACE_RESPONSE_DETAIL,
  REPLACE_RESPONSE_UPDATE,
  REPLACE_RESPONSE_CREATE,
} from './utils';

export function jsonSchemaToTsInterface(
  name: string,
  schema: any,
  currentString: string,
  schemas: Record<string, any>,
): string {
  if (name.includes('_meta') || name === 'any' || name.includes('|') || name.includes('_data_item')) return '';

  const interfaceName = name.includes('Dto') ? extractText(name) : name.replace('_for_', '');
  let tsInterface = `export interface ${interfaceName} {\n`;
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  let nestedType: string | undefined;
  for (const [propName, propDetails] of Object.entries(properties) as [string, any][]) {
    const nullable = propDetails.nullable ?? false;
    let propType: string | undefined;
    if (
      propName === 'data' &&
      (name.includes(REPLACE_RESPONSE_DETAIL) ||
        name.includes(REPLACE_RESPONSE_UPDATE) ||
        name.includes(REPLACE_RESPONSE_CREATE))
    ) {
      propType = name
        .replace(REPLACE_RESPONSE_DETAIL, '')
        .replace(REPLACE_RESPONSE_UPDATE, '')
        .replace(REPLACE_RESPONSE_CREATE, '');
    } else {
      propType = resolvePropertyType(propName, propDetails, interfaceName, schemas, currentString, false);
      if (typeof propType !== 'string') {
        nestedType = propType[1];
        propType = propType[0];
      }
    }
    // Property is optional if nullable or not required
    const isOptional = nullable || !required.includes(propName);
    tsInterface += `  ${propName}${isOptional ? '?' : ''}: ${propType}\n`;
  }
  if (nestedType) {
    tsInterface += `}\n\n${nestedType}`;
  } else {
    tsInterface += `}`;
  }
  return tsInterface;
}

function resolvePropertyType(
  propName: string,
  propDetails: any,
  parentName: string,
  schemas: Record<string, any>,
  currentString: string,
  inlineObject: boolean = false,
): string {
  /**
   * Resolves the TypeScript type for a JSON schema property.
   * @param propName - Property name
   * @param propDetails - Property schema details
   * @param parentName - Parent schema name
   * @param schemas - OpenAPI schemas object
   * @param currentString - Existing interface string to avoid duplicates
   * @param inlineObject - Whether to generate inline object types
   * @returns TypeScript type string
   */
  if (propDetails.$ref) {
    return propDetails.$ref.split('/').pop() || 'any';
  }
  if (propDetails.allOf) {
    return propDetails.allOf
      .filter((item: any) => item.$ref)
      .map((item: any) => item.$ref.split('/').pop() || 'any')
      .join(' & ');
  }
  // console.log('propName', propName)

  if (propDetails.type === 'array') {
    const itemsType = resolvePropertyType(
      `${propName}_item`,
      propDetails.items ?? {},
      parentName,
      schemas,
      currentString,
      inlineObject,
    );

    let res = '';

    // If the array items use a $ref
    if (propDetails?.items?.$ref) {
      const schemaRef = itemsType;
      const schema = schemas[schemaRef];

      if (schema) {
        let targetSchema = schema;

        // Try to extract from allOf[1] if it exists, fallback to schema itself
        if (Array.isArray(schema.allOf)) {
          // Prefer the second one (typically more detailed)
          targetSchema = schema.allOf[1] ?? schema.allOf[0] ?? schema;
        }

        // Now generate nested result
        res = jsonSchemaToTsInterface(itemsType, targetSchema, '', schemas);
      } else {
        console.warn(`! Schema '${schemaRef}' not found in components.schemas`);
      }
    }

    if (res) {
      return [`${itemsType}[]`, `${res}`];
    }
    return `${itemsType}[]`;
  }
  if (propDetails.type === 'object' && !inlineObject) {
    const nestedInterfaceName = `${parentName}_${propName}`;
    if (!currentString.includes(`export interface ${nestedInterfaceName}`)) {
      const nestedInterface = jsonSchemaToTsInterface('babi', propDetails, currentString, schemas);
      const result = nestedInterface.replace('export interface babi ', '');
      console.log('TRUE', result);
      if (nestedInterface) {
        return result;
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
