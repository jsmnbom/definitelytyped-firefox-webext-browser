interface NamespaceSchema {
  namespace: string;
  description?: string;
  allowedContexts: string[];
  types?: TypeSchema[];
  $import?: string;
  functions?: TypeSchema[];
  properties?: Indexable<TypeSchema>;
  events?: TypeSchema[];
  permissions?: string[];
  min_manifest_version: number;
  max_manifest_version: number;
}

interface NameDesc {
  name: string;
  description: string;
}

type Enum = string | NameDesc;

interface TypeSchema {
  id?: string;
  name?: string;
  $ref?: string;
  $extend?: string;
  $import?: string;
  parameters?: TypeSchema[];
  extraParameters?: TypeSchema[];
  deprecated?: boolean | string;
  unsupported?: boolean;
  returns?: TypeSchema;
  description?: string;
  optional?: boolean;
  functions?: TypeSchema[];
  events?: TypeSchema[];
  properties?: Indexable<TypeSchema>;
  patternProperties?: Indexable<TypeSchema>;
  choices?: TypeSchema[];
  enum?: Enum[];
  type?: string;
  isInstanceOf?: string;
  additionalProperties?: TypeSchema;
  minItems?: number;
  maxItems?: number;
  items?: TypeSchema;
  value?: unknown;
  async?: boolean | 'callback';
  converterTypeOverride?: string;
  converterAdditionalType?: string;
  converterPromiseOptional?: boolean;
  converterPromiseOptionalNull?: boolean;
  min_manifest_version?: number;
  max_manifest_version?: number;
}
interface Indexable<V> {
  [k: string]: V;
}
