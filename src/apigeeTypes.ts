/*
  Copyright 2024 Google LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

export interface IAPIProxy {
  $schema?: string;
  APIProxy: {
    "Description"?: string;
    "DisplayName"?: string;
    "@name": string;
    "@revision": string;
  };
}

export interface IProxyEndpoint {
  $schema?: string;
  ProxyEndpoint: {
    "Description"?: string;
    "FaultRules"?: TypeFaultRules;
    "DefaultFaultRule"?: Record<string, never> | TypeDefaultFaultRuleObj;
    "PreFlow"?: Record<string, never> | TypePrePostFlowObj;
    "Flows"?: TypeFlows;
    "PostFlow"?: Record<string, never> | TypePrePostFlowObj;
    "PostClientFlow"?: TypePrePostFlowObj;
    "HTTPProxyConnection": {
      BasePath: string;
      Properties?: Record<string, never> | TypeProperties;
      VirtualHost?: string | string[];
    };
    "RouteRule"?: string | TypeRouteRuleObj | TypeRouteRuleObj[];
    "@name": string;
  };
}

export type TypeFaultRules = string | Record<string, never> | TypeFaultRule;

export interface TypeFaultRule {
  FaultRule: TypeFaultRuleObj | TypeFaultRuleObj[];
}

export interface TypeFaultRuleObj {
  "Step"?: TypeStepObj;
  "Condition"?: string;
  "@name": string;
}

export interface TypeDefaultFaultRuleObj {
  "Step"?: TypeStepObj | TypeStepObj[];
  "Condition"?: string;
  "AlwaysEnforce"?: boolean;
  "@name": string;
}

export interface TypePrePostFlowObj {
  "@name"?: string;
  "Description"?: string;
  "Request"?: Record<string, never> | TypeStep;
  "Response"?: Record<string, never> | TypeStep;
  "Condition"?: string;
}

export interface TypeFlowObj {
  "@name": string;
  "Description"?: string;
  "Request"?: Record<string, never> | TypeStep;
  "Response"?: Record<string, never> | TypeStep;
  "Condition"?: string;
}

export type TypeFlow = TypeFlowObj | TypeFlowObj[];

export interface TypeFlows {
  Flow: TypeFlow;
}
export interface TypeProperties {
  Property: TypePropertyObj | TypePropertyObj[];
}

export interface TypePropertyObj {
  "@name": string;
  "value": boolean | "true" | "false";
}

export interface TypeStep {
  Step: TypeStepObj | TypeStepObj[];
}

export interface TypeStepObj {
  Name: string;
  Condition?: string;
}

export interface TypeRouteRuleObj {
  "@name": string;
  "TargetEndpoint"?: string;
  "IntegrationEndpoint"?: string;
  "Condition"?: string;
  "URL"?: string;
}

export type TypeRouteRule = string | TypeRouteRuleObj | TypeRouteRuleObj[];
