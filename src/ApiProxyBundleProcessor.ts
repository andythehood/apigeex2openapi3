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

import AdmZip from "adm-zip";
import {XMLParser, X2jOptions} from "fast-xml-parser";
import {OpenAPIV3} from "openapi-types";

import {
  IProxyEndpoint,
  TypeFlowObj,
  IAPIProxy,
  TypePrePostFlowObj,
  TypeStepObj,
} from "./apigeeTypes";

type PolicyParametersType = {
  policyName: string;
  type: string;
  name: string;
  value: string;
};

export class ApiProxyBundleProcessor {
  private parser: XMLParser;

  constructor() {
    const parserOptions: X2jOptions = {
      ignoreDeclaration: true,
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      textNodeName: "value",
    };

    this.parser = new XMLParser(parserOptions);
  }

  private parseApiProxyXml = async (
    openapiSpec: OpenAPIV3.Document,
    proxyName: string,
    xmlString: string,
  ) => {
    try {
      // Replace non-breaking space characters
      const {APIProxy}: IAPIProxy = this.parser.parse(
        xmlString.replace(/[\u00A0]/g, " "),
      );

      // console.log("apiproxy", APIProxy);

      openapiSpec.info.title = APIProxy.DisplayName || proxyName;
      openapiSpec.info.description =
        APIProxy.Description ||
        `Auto-generated OpenApi specification for API Proxy: ${proxyName}`;
      openapiSpec.info.version = `1.0.${APIProxy["@revision"]}`;
      openapiSpec.info.contact = {
        email: "apigee@google.com",
      };
    } catch (e) {
      if (e instanceof Error) {
        console.error(e.message);
      }
    }
  };

  private parsePolicyXml = async (
    xmlString: string,
  ): Promise<PolicyParametersType[]> => {
    const policyParameters: PolicyParametersType[] = [];

    try {
      // Replace non-breaking space characters
      const policy = this.parser.parse(xmlString.replace(/[\u00A0]/g, " "));

      const policyType = Object.keys(policy)[0];
      if (policyType === "ExtractVariables") {
        const {ExtractVariables} = policy;

        if (
          !ExtractVariables.Source ||
          ExtractVariables.Source === "request" ||
          ExtractVariables.Source.value === "request"
        ) {
          if (Array.isArray(ExtractVariables.Header)) {
            for (const header of ExtractVariables.Header) {
              if (header["@name"] && header.Pattern) {
                policyParameters.push({
                  policyName: ExtractVariables["@name"],
                  type: "header",
                  name: header["@name"],
                  value: header.Pattern.value || header.Pattern,
                });
              }
            }
          } else if (
            ExtractVariables.Header &&
            ExtractVariables.Header["@name"] &&
            ExtractVariables.Header.Pattern
          ) {
            policyParameters.push({
              policyName: ExtractVariables["@name"],
              type: "header",
              name: ExtractVariables.Header["@name"],
              value:
                ExtractVariables.Header.Pattern.value ||
                ExtractVariables.Header.Pattern,
            });
          }

          if (Array.isArray(ExtractVariables.QueryParam)) {
            for (const queryParam of ExtractVariables.QueryParam) {
              // console.log("queryParam", queryParam);
              if (queryParam["@name"] && queryParam.Pattern) {
                policyParameters.push({
                  policyName: ExtractVariables["@name"],
                  type: "query",
                  name: queryParam["@name"],
                  value: queryParam.Pattern.value || queryParam.Pattern,
                });
              }
            }
          } else if (
            ExtractVariables.QueryParam &&
            ExtractVariables.QueryParam["@name"] &&
            ExtractVariables.QueryParam.Pattern
          ) {
            policyParameters.push({
              policyName: ExtractVariables["@name"],
              type: "query",
              name: ExtractVariables.QueryParam["@name"],
              value:
                ExtractVariables.QueryParam.Pattern.value ||
                ExtractVariables.QueryParam.Pattern,
            });
          }
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        console.error(e.message);
      }
    }
    return policyParameters;
  };

  private getFlowParameters = (
    flowRequestStep: TypeStepObj | TypeStepObj[] | undefined,
    policyParameters: PolicyParametersType[],
  ): OpenAPIV3.ParameterObject[] => {
    const parameters: OpenAPIV3.ParameterObject[] = [];

    if (flowRequestStep) {
      // console.log("Step=", flowRequestStep);
      if (Array.isArray(flowRequestStep)) {
        for (const step of flowRequestStep) {
          if (typeof step === "object") {
            const policyName: string = step.Name;

            const param = policyParameters.find(
              (p) => p.policyName === policyName,
            );
            if (param) {
              parameters.push({
                in: param.type,
                name: param.name,
                required: true,
                example: param.value,
                schema: {type: "string"},
              });
            }
          }
        }
      } else if (typeof flowRequestStep === "object") {
        const policyName: string = flowRequestStep.Name;

        const param = policyParameters.find((p) => p.policyName === policyName);
        if (param) {
          parameters.push({
            in: param.type,
            name: param.name,
            required: true,
            example: param.value,
            schema: {type: "string"},
          });
        }
      }
    }
    return parameters;
  };

  private parseConditionalFlow = (
    openapiSpec: OpenAPIV3.Document,
    endpointName: string,
    basePath: string,
    flow: TypeFlowObj,
    preflow: Record<string, never> | TypePrePostFlowObj | undefined,
    policyParameters: PolicyParametersType[],
  ) => {
    // console.log("processing conditional flow", basePath, flow);

    if (flow.Condition) {
      // console.log("condition", flow.Condition);

      const verbRegex = /request.verb(?:\s*=\s*| equals )"(.*?)"/g;
      const verbRegexExecArray = verbRegex.exec(flow.Condition);

      const pathSuffixRegex = /proxy.pathsuffix MatchesPath "(.*?)"/g;
      const pathSuffixRegexExecArray = pathSuffixRegex.exec(flow.Condition);
      // console.log(pathRegexExecArray);

      if (pathSuffixRegexExecArray && pathSuffixRegexExecArray[1]) {
        const pathSuffix = pathSuffixRegexExecArray[1];

        const path = `${basePath}${
          pathSuffix.slice(-1) === "/"
            ? pathSuffix.substring(0, pathSuffix.length - 1)
            : pathSuffix
        }`;
        // const tag = `${basePath.substring(1)}${
        //   pathSuffix.slice(-1) === "/"
        //     ? "-" + pathSuffix.substring(1, pathSuffix.length - 1)
        //     : pathSuffix.substring(1)
        // }`;

        const tag = `${basePath}${
          pathSuffix.slice(-1) === "/"
            ? pathSuffix.substring(0, pathSuffix.length - 1)
            : pathSuffix
        }`;

        if (!openapiSpec.paths[path]) {
          openapiSpec.paths[path] = {};
        }
        openapiSpec.paths[
          path
        ].description = `Operations for proxy endpoint '${endpointName}' for path '${basePath}${pathSuffix}'`;

        openapiSpec.tags?.push({
          name: tag,
        });

        const paramRegex = /\{(.*?)\}/g;
        const parameters: OpenAPIV3.ParameterObject[] = [];

        let paramRegexExecArray = paramRegex.exec(pathSuffixRegexExecArray[1]);
        while (paramRegexExecArray !== null && paramRegexExecArray[1]) {
          // const paramRegexExecArray = paramRegex.exec(pathRegexExecArray[1]);
          if (paramRegexExecArray) {
            parameters.push({
              name: paramRegexExecArray[1],
              in: "path",
              required: true,
              schema: {type: "string"},
            });
          }
          paramRegexExecArray = paramRegex.exec(pathSuffixRegexExecArray[1]);
        }
        // Add Header and Query Parameters from any ExtractVariables policies in the Preflow
        parameters.push(
          ...this.getFlowParameters(preflow?.Request?.Step, policyParameters),
        );
        // Add Header and Query Parameters from any ExtractVariables policies in the Conditional Flow
        if (!verbRegexExecArray) {
          parameters.push(
            ...this.getFlowParameters(flow?.Request?.Step, policyParameters),
          );
        }

        // If the Method (verb) has been specified
        if (verbRegexExecArray && verbRegexExecArray[1]) {
          const verb =
            verbRegexExecArray[1].toLowerCase() as OpenAPIV3.HttpMethods;

          // console.log(basePath, path, verb);

          if (!openapiSpec.paths[path][verb]) {
            openapiSpec.paths[path][verb] = {responses: {}};
          }

          openapiSpec.paths[path][
            verb
          ].summary = `Conditional Flow: ${flow["@name"]}`;

          openapiSpec.paths[path][verb].description =
            flow.Description ||
            `A definition of a ${verb.toUpperCase()} operation on this path`;

          openapiSpec.paths[path][verb].operationId = `${basePath.substring(
            1,
          )}-${pathSuffix.substring(1).replace(/[{}]/g, "")}-${verb}`;

          openapiSpec.paths[path][verb].operationId = openapiSpec.paths[path][
            verb
          ].operationId.replaceAll("/", "-");

          openapiSpec.paths[path][verb].tags = [tag];

          openapiSpec.paths[path][verb].responses = {
            "200": {
              description: "Successful response",
            },
            "4XX": {
              description: "Client error responses",
            },
            "5XX": {
              description: "Server error responses",
            },
          };

          // Add Header and Query Parameters from any ExtractVariables policies in the Conditional Flow
          const pathParameters = this.getFlowParameters(
            flow?.Request?.Step,
            policyParameters,
          );
          if (pathParameters.length) {
            openapiSpec.paths[path][verb].parameters = pathParameters;
          }
        }

        if (parameters.length) {
          // Remove any duplicate parameters (ExtractVariables Policy could, but shouldn't, be included multiple times)
          openapiSpec.paths[path].parameters = parameters.filter(
            (o, index, arr) =>
              arr.findIndex(
                (item) => item.name === o.name && item.in === o.in,
              ) === index,
          );
        }
      }
    } else {
      // Default Flow, i.e. No Condition clause

      const path = `${basePath}`;

      if (!openapiSpec.paths[path]) {
        openapiSpec.paths[path] = {};
      }
      openapiSpec.paths[
        path
      ].description = `Operations for proxy endpoint '${endpointName}' for path '${basePath}'`;

      openapiSpec.tags?.push({
        name: `${basePath}`,
      });

      // Add Header and Query Parameters from any ExtractVariables policies in the Preflow
      const parameters: OpenAPIV3.ParameterObject[] = this.getFlowParameters(
        preflow?.Request?.Step,
        policyParameters,
      );

      // console.log("parameters", parameters);
      openapiSpec.paths[path].parameters = parameters;
    }
  };

  private parseProxyEndpointsXml = async (
    openapiSpec: OpenAPIV3.Document,
    xmlString: string,
    policyParameters: PolicyParametersType[],
  ) => {
    // Parse XML and XSD

    try {
      // Replace non-breaking space characters
      const {ProxyEndpoint}: IProxyEndpoint = this.parser.parse(
        xmlString.replace(/[\u00A0]/g, " "),
      );

      const basePath = ProxyEndpoint.HTTPProxyConnection.BasePath;
      const endpointName = ProxyEndpoint["@name"];

      if (typeof ProxyEndpoint.Flows === "object") {
        if (Array.isArray(ProxyEndpoint.Flows.Flow)) {
          for (const flow of ProxyEndpoint.Flows.Flow) {
            this.parseConditionalFlow(
              openapiSpec,
              endpointName,
              basePath,
              flow,
              ProxyEndpoint.PreFlow,
              policyParameters,
            );
          }
        } else if (typeof ProxyEndpoint.Flows.Flow === "object") {
          this.parseConditionalFlow(
            openapiSpec,
            endpointName,
            basePath,
            ProxyEndpoint.Flows.Flow,
            ProxyEndpoint.PreFlow,
            policyParameters,
          );
        }
      } else {
        // No conditional flows
        const path = ProxyEndpoint.HTTPProxyConnection.BasePath;
        openapiSpec.paths[path] = {};
        openapiSpec.paths[
          path
        ].description = `Operations for proxy endpoint '${ProxyEndpoint["@name"]}' for path '${basePath}'`;

        openapiSpec.tags?.push({
          name: `${basePath}`,
        });
      }
    } catch (e) {
      if (e instanceof Error) {
        console.error(e.message);
      }
    }
  };

  public generateOpenapiSpec = async (
    proxyName: string,
    proxyBundle: ArrayBuffer,
    hostnames: string[],
  ) => {
    const zip = new AdmZip(Buffer.from(proxyBundle));
    const zipEntries = zip.getEntries();

    const apiProxyXml = zip.readAsText(`apiproxy/${proxyName}.xml`);

    const openapiSpec: OpenAPIV3.Document = {
      openapi: "3.0.0",
      info: {
        title: "",
        version: "",
      },
      servers: hostnames.map((hostname) => {
        return {
          url: `https://${hostname}`,
        };
      }),
      tags: [],
      paths: {},
    };

    await this.parseApiProxyXml(openapiSpec, proxyName, apiProxyXml);

    // Build table of Extract Variables policies

    const policyParameters: PolicyParametersType[] = [];

    for (const ze of zipEntries) {
      // console.log(ze.entryName);

      if (ze.entryName.startsWith("apiproxy/policies/") && !ze.isDirectory) {
        const policyXml = zip.readAsText(ze);
        policyParameters.push(...(await this.parsePolicyXml(policyXml)));
      }
    }

    for (const ze of zipEntries) {
      // console.log(ze.entryName);

      if (ze.entryName.startsWith("apiproxy/proxies/") && !ze.isDirectory) {
        const proxyEndpointsXml = zip.readAsText(ze);
        await this.parseProxyEndpointsXml(
          openapiSpec,
          proxyEndpointsXml,
          policyParameters,
        );
      }
    }

    // Remove any duplicate tags from the array
    openapiSpec.tags = Array.from(
      new Map(openapiSpec.tags?.map((item) => [item.name, item])).values(),
    );

    return openapiSpec;
  };
}
