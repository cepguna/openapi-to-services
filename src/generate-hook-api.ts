import { toCamelCase, toKebabCase, toPascalCase } from './utils';

interface Parameter {
  name: string;
  schema: { type: string };
  in?: string;
  required?: boolean;
}

interface DtoCode {
  [key: string]: string;
}

export function generateHookFunctionApi(
  method: string,
  tag: string,
  url: string,
  summary: string,
  responseType: string,
  requestType: string,
  fnName: string,
  parameters: Parameter[] | null,
  dtoCode: DtoCode,
): string {
  /**
   * Generates TypeScript React hook function code for an API operation.
   * @param method - HTTP method (get, post, patch, put, delete)
   * @param tag - API tag for grouping
   * @param url - API endpoint URL
   * @param summary - Hook function name
   * @param responseType - Response TypeScript type
   * @param requestType - Request TypeScript type
   * @param fnName - API function name to call
   * @param parameters - Query or path parameters
   * @param dtoCode - DTO properties for select hooks
   * @returns Generated TypeScript hook function code
   */
  const params = parameters || [];
  const dynamicSegments = url
    .split('/')
    .filter((segment) => segment.startsWith('{') && segment.endsWith('}'))
    .map((segment) => segment.replace(/[{}]/g, ''));

  const dynamicParams = dynamicSegments.length > 0 ? `${dynamicSegments.join(': string, ')}: string` : '';

  const queryParams = params
    .filter((param) => param.in === 'query')
    .map((param) => ({
      name: param.name,
      type: param.schema.type === 'integer' ? 'number' : param.schema.type,
      optional: !param.required,
    }));

  const queryParamTypes = queryParams
    .map((param) => `${param.name}${param.optional ? '?' : ''}: ${param.type}`)
    .join(', ');

  const isQueryExists = queryParamTypes ? 'query' : '';
  const useSelectName = toCamelCase(`useSelect ${summary.replace('useGetAll', '')}`);
  const capitalTag = toPascalCase(tag);
  const labelSelect = ['name', 'title', 'label'].find((key) => key in dtoCode) || 'id';

  let hookFunction = '';
  console.log('summar', summary);
  if (method === 'get' && summary.toLowerCase().includes('all')) {
    hookFunction += `
export const ${useSelectName} = (${
      queryParamTypes ? `query: { ${queryParamTypes} }, ` : ''
    }options?: TQueryOptions) => {
  const [listData, setListData] = useState<{ label: string; value: string; data: any }[]>([]);
  const { isPending, isError, error, data, refetch } = useAppQuery<${responseType}>(
    ['${tag}', 'select-${tag}', ${isQueryExists}],
    () => ${fnName}(${isQueryExists}),
    options
  );

  useEffect(() => {
    const resData = data?.data;
    if (Array.isArray(resData)) {
      setListData(resData.map(item => ({
        value: item.id,
        label: \`\${item?.${labelSelect}}\`,
        data: item
      })));
    }
  }, [data, isError]);

  return {
    isLoading${capitalTag}: isPending,
    isError${capitalTag}: isError,
    error${capitalTag}: error,
    data${capitalTag}: listData,
    refetch${capitalTag}: refetch
  };
};
`;

    hookFunction += `
export const ${summary} = (${queryParamTypes ? `query: { ${queryParamTypes} }, ` : ''}options?: TQueryOptions) => {
  const response = useAppQuery<${responseType}>(
    ['${tag}', '${toKebabCase(summary)}', ${isQueryExists}],
    () => ${fnName}(${isQueryExists}),
    options
  );
  return { ...response, list${capitalTag}: response?.data?.data ?? [] };
};
`;
  } else if (method === 'get' && dynamicSegments.length > 0 && responseType.toLowerCase().includes('list')) {
    const params = dynamicSegments.join(', ');
    const paramsBoolean = dynamicSegments.map((param) => `Boolean(${param})`).join(' && ');
    hookFunction += `
export const ${summary} = (${dynamicParams}, options?: TQueryOptions) => {
  const response = useAppQuery<${responseType}>(
    ['${tag}', '${toKebabCase(summary)}', ${params}],
    () => ${fnName}(${params}),
    { enabled: ${paramsBoolean}, ...options  }
  );
  return { ...response, list${capitalTag}: response?.data?.data ?? [] };
};
`;
  } else if (method === 'get' && dynamicSegments.length > 0) {
    const params = dynamicSegments.join(', ');
    const paramsBoolean = dynamicSegments.map((param) => `Boolean(${param})`).join(' && ');
    hookFunction += `
export const ${summary} = (${dynamicParams}, options?: TQueryOptions) => {
  const response = useAppQuery<${responseType}>(
    ['${tag}', '${toKebabCase(summary)}', ${params}],
    () => ${fnName}(${params}),
    { ...options, enabled: ${paramsBoolean} }
  );
  return { ...response, detail${capitalTag}: response?.data?.data ?? undefined };
};
`;
  } else if (method === 'get') {
    hookFunction += `
export const ${summary} = (${queryParamTypes ? `query: { ${queryParamTypes} }, ` : ''}options?: TQueryOptions) => {
  const response = useAppQuery<${responseType}>(
    ['${tag}', '${toKebabCase(summary)}', ${isQueryExists}],
    () => ${fnName}(${isQueryExists}),
    options
  );
  return { ...response, detail${capitalTag}: response?.data?.data ?? undefined };
};
`;
  } else if (method === 'post') {
    const params = dynamicSegments.length > 0 ? dynamicSegments.map((param) => `value.${param}`).join(', ') : '';
    const templateValue = dynamicSegments.length > 0 ? `(${params}, value)` : '(value)';
    hookFunction += `
export const ${summary} = (options?: TMutationOptions) => {
  return useAppMutation<${requestType}>(
    (value) => ${fnName}${templateValue},
    { ...options, toastError: "failed/submit", toastSuccess: "success/submit", source: "${tag}" }
  );
};
`;
  } else if (['patch', 'put'].includes(method)) {
    const params = dynamicSegments.join(', ');
    hookFunction += `
export const ${summary} = (${dynamicParams ? `${dynamicParams}, ` : ''}options?: TMutationOptions) => {
  return useAppMutation<${requestType}>(
    (value) => ${fnName}(${dynamicParams ? `${params}, value` : 'value'}),
    { ...options, toastError: "failed/update", toastSuccess: "success/update", source: "${tag}" }
  );
};
`;
  } else if (method === 'delete') {
    const params = dynamicSegments.join(', ');
    hookFunction += `
export const ${summary} = (${dynamicParams ? `${dynamicParams}, ` : ''}options?: TMutationOptions) => {
  return useAppMutation<string>(
    () => ${fnName}(${params}),
    { ...options, toastError: "failed/delete", toastSuccess: "success/delete", source: "${tag}" }
  );
};
`;
  }

  return hookFunction;
}
