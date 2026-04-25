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
   * @returns Generated TypeScript function code
   */
  const endpoint = url.replace('/api/v1/', '').replace('_', '-');
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

  switch (method.toLowerCase()) {
    case 'get':
      if (summary.toLowerCase().includes('all')) {
        return queryParamTypes
          ? `
export const ${summary} = async (query: { ${queryParamTypes} }) => {
  const url = qs.stringifyUrl({
    url: \`${endpoint}\`,
    query,
  }, {
    skipEmptyString: true,
    skipNull: true
  });
  return ApiHelper.all<${responseType}>(url);
};
`
          : `
export const ${summary} = async () => {
  return ApiHelper.all<${responseType}>(\`${endpoint}\`);
};
`;
      }
      if(queryParamTypes){

      return `
export const ${summary} = async (query: { ${queryParamTypes} }) => {
  const url = qs.stringifyUrl({
    url: \`${dynamicPath}\`,
    query,
  }, {
    skipEmptyString: true,
    skipNull: true
  });
  return ApiHelper.detail<${responseType}>(url);
};
`;
      }else{

      return `
export const ${summary} = async (${[dynamicParams, queryParamTypes].filter(Boolean).join(', ')}) => {
  return ApiHelper.detail<${responseType}>(\`${dynamicPath}\`);
};
`;
      }
    case 'post':
      return `
export const ${summary} = async (${[dynamicParams, `body: ${requestType}`].filter(Boolean).join(', ')}) => {
  return ApiHelper.createUpdate<${requestType}, ${responseType}>(\`${dynamicPath}\`, body);
};
`;
    case 'patch':
      return `
export const ${summary} = async (${[dynamicParams, `body: ${requestType}`].filter(Boolean).join(', ')}) => {
  return ApiHelper.updatePatch<${requestType}, ${responseType}>(\`${dynamicPath}\`, body);
};
`;
    case 'put':
      return `
export const ${summary} = async (${[dynamicParams, `body: ${requestType}`].filter(Boolean).join(', ')}) => {
  return ApiHelper.updatePut<${requestType}, ${responseType}>(\`${dynamicPath}\`, body);
};
`;
    case 'delete':
      return `
export const ${summary} = async (${dynamicParams}) => {
  return ApiHelper.deletee<any>(\`${dynamicPath}\`);
};
`;
    default:
      return '';
  }
}
