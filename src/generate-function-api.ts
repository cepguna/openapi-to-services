interface Parameter {
  name: string;
  schema: { type: string };
  in?: string;
  required?: boolean;
}

export function generateFunctionApi(
  method: string,
  tag: string,
  url: string,
  summary: string,
  responseType: string,
  requestType: string,
  parameters: Parameter[] | null,
  stripPrefix: string = '/api/v1/',
): string {
  /**
   * Generates TypeScript API function code for a given HTTP method.
   * @param method - HTTP method (get, post, patch, put, delete)
   * @param tag - API tag for grouping
   * @param url - API endpoint URL
   * @param summary - FunctionОСФ function name
   * @param responseType - Response TypeScript type
   * @param requestType - Request TypeScript type
   * @param parameters - Query or path parameters
   * @param stripPrefix - Prefix to strip from the URL
   * @returns Generated TypeScript function code
   */
  const endpoint = url.replace(stripPrefix, '').replace('_', '-');
  const dynamicSegments = endpoint
    .split('/')
    .filter((segment) => segment.startsWith('{') && segment.endsWith('}'))
    .map((segment) => segment.replace(/[{}]/g, '').replaceAll('-', '_'));

  const dynamicParams = dynamicSegments.length > 0 ? `${dynamicSegments.join(': string, ')}: string` : '';

  const dynamicPath = endpoint
    .split('/')
    .map((segment) =>
      segment.startsWith('{') && segment.endsWith('}')
        ? `$\{${segment.replace(/[{-}]/g, '').replace('-', '_')}}`
        : segment,
    )
    .join('/');

  const queryParams = (parameters || [])
    .filter((param) => param.in === 'query')
    .map((param) => ({
      name: param.name,
      type: param.schema.type === 'integer' ? 'number' : param.schema.type,
      optional: !param.required,
    }));

  const queryParamTypes = queryParams
    .map((param) => `${param.name}${param.optional ? '?' : ''}: ${param.type}`)
    .join(', ');

    const dynamicType = requestType.replaceAll(' ', '') ? requestType.replaceAll(' ', '') : 'any'

  switch (method.toLowerCase()) {
    case 'get':
      if (summary.toLowerCase().includes('all')) {
        return queryParamTypes
          ? `
const ${summary} = async (params: { ${queryParamTypes} }) => {
  return ApiHelper.get<${responseType}>({
    source: '${endpoint}',
    params,
  });
};
`
          : `
const ${summary} = async () => {
  return ApiHelper.get<${responseType}>({
    source: '${endpoint}',
  });
};
`;
      }
      if(queryParamTypes){

      return `
const ${summary} = async (params: { ${queryParamTypes} }) => {
  return ApiHelper.get<${responseType}>({
    source: \`${dynamicPath}\`,
    params,
  });
};
`;
      }else{

      return `
const ${summary} = async (${[dynamicParams, queryParamTypes].filter(Boolean).join(', ')}) => {
  return ApiHelper.get<${responseType}>({
    source: \`${dynamicPath}\`,
  });
};
`;
      }
    case 'post':
      return `
const ${summary} = async (${[dynamicParams, `body: ${dynamicType}`].filter(Boolean).join(', ')}) => {
  return ApiHelper.create<${dynamicType}, ${responseType}>({
    source: \`${dynamicPath}\`,
    body,
  });
};
`;
    case 'patch':
      return `
const ${summary} = async (${[dynamicParams, `body: ${dynamicType}`].filter(Boolean).join(', ')}) => {
  return ApiHelper.updatePatch<${dynamicType}, ${responseType}>({
    source: \`${dynamicPath}\`,
    body,
  });
};
`;
    case 'put':
      return `
const ${summary} = async (${[dynamicParams, `body: ${dynamicType}`].filter(Boolean).join(', ')}) => {
  return ApiHelper.updatePut<${dynamicType}, ${responseType}>({
    source: \`${dynamicPath}\`,
    body,
  });
};
`;
    case 'delete':
      return `
const ${summary} = async (${dynamicParams}) => {
  return ApiHelper.delete<any>({
    source: \`${dynamicPath}\`,
  });
};
`;
    default:
      return '';
  }
}
