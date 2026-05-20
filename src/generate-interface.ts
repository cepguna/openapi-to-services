import {
  extractText,
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
  if (
    currentString.includes(`export interface ${interfaceName} `) ||
    currentString.includes(`export interface ${interfaceName}{\n`) ||
    currentString.includes(`export interface ${interfaceName} {\n`)
  ) {
    return '';
  }

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
    const types = propDetails.allOf.map((item: any) => {
      if (item.$ref) {
        return item.$ref.split('/').pop() || 'any';
      }
      return resolvePropertyType(propName, item, parentName, schemas, currentString, true);
    });
    return Array.from(new Set(types)).join(' & ');
  }
  if (propDetails.anyOf) {
    const types = propDetails.anyOf.map((item: any) =>
      resolvePropertyType(propName, item, parentName, schemas, currentString, inlineObject)
    );
    return Array.from(new Set(types)).join(' | ');
  }
  if (propDetails.oneOf) {
    const types = propDetails.oneOf.map((item: any) =>
      resolvePropertyType(propName, item, parentName, schemas, currentString, inlineObject)
    );
    return Array.from(new Set(types)).join(' | ');
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
    const finalizedItemsType = itemsType.includes('|') || itemsType.includes('&') ? `(${itemsType})` : itemsType;
    return `${finalizedItemsType}[]`;
  }
  if ((propDetails.type === 'object' || propDetails.properties) && !propDetails.properties && propDetails.additionalProperties) {
    const valueType = resolvePropertyType(
      `${propName}_value`,
      propDetails.additionalProperties === true ? {} : propDetails.additionalProperties,
      parentName,
      schemas,
      currentString,
      inlineObject,
    );
    return `Record<string, ${valueType}>`;
  }
  if ((propDetails.type === 'object' || propDetails.properties) && !inlineObject) {
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
  if ((propDetails.type === 'object' || propDetails.properties) && inlineObject) {
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
