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

import {AuthClient, GoogleAuth} from "google-auth-library";
import YAML from "yaml";

import {Spectral} from "@stoplight/spectral-core";
import {default as oasRuleset} from "@stoplight/spectral-rulesets/dist/oas/index.js";

import {OpenAPIV3} from "openapi-types";
import {ApiProxy, ApiProxiesList, EnvironmentGroupsList} from "./types";
import {ApiProxyBundleProcessor} from "./ApiProxyBundleProcessor";

const getApiProxyList = async (
  client: AuthClient,
  orgName: string,
): Promise<ApiProxy[]> => {
  const url = `https://apigee.googleapis.com/v1/organizations/${orgName}/apis?includeRevisions=true`;
  const res = await client.request<ApiProxiesList>({url});
  // console.log(JSON.stringify(res.data, null, 2));

  return res.data.proxies;
};

const getApiProxyBundle = async (
  client: AuthClient,
  orgName: string,
  apiName: string,
  revision: string | undefined,
): Promise<ArrayBuffer> => {
  if (!revision) {
    const url = `https://apigee.googleapis.com/v1/organizations/${orgName}/apis/${apiName}/revisions`;
    const res = await client.request<string[]>({url});

    revision = Math.max(...res.data.map((n) => parseInt(n, 10))).toString();
  }

  const url = `https://apigee.googleapis.com/v1/organizations/${orgName}/apis/${apiName}/revisions/${revision}?format=bundle`;
  const res = await client.request<Blob>({url});

  return await res.data.arrayBuffer();
};

const getHostnames = async (client: AuthClient, orgName: string) => {
  const url = `https://apigee.googleapis.com/v1/organizations/${orgName}/envgroups`;
  const res = await client.request<EnvironmentGroupsList>({url});
  // console.log(JSON.stringify(res.data, null, 2));

  const hostnames = res.data.environmentGroups.flatMap((eg) => eg.hostnames);
  return hostnames;
};

// const createApiHubSpec = async (
//   client: AuthClient,
//   orgName: string,
//   apiproxyname: string,
//   spec: OpenAPIV3.Document,
// ) => {
//   try {
//     let url = `https://apihub.googleapis.com/v1/projects/${orgName}/locations/us-central1/apis/${orgName}-${apiproxyname}/versions/version-1/specs`;

//     let res = await client.request<any>({
//       url: url,
//       method: "GET",
//       headers: {},
//     });
//     console.log(JSON.stringify(res.data, null, 2));

//     if (res.data.specs && res.data.specs.length > 0) {
//       const specName = res.data.specs[0].name;

//       url = `https://apihub.googleapis.com/v1/${specName}`;

//       const body = {
//         displayName: "OpenAPI 3.0 Spec",
//         contents: {
//           contents: Buffer.from(YAML.stringify(spec)).toString("base64"),
//           mimeType: "application/yaml",
//         },
//         specType: {
//           enumValues: {
//             values: [{id: "openapi"}],
//           },
//         },
//       };

//       res = await client.request<any>({
//         url: url,
//         method: "PATCH",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         params: {
//           updateMask: "contents,specType", // Don't add a space
//         },
//         body: JSON.stringify(body),
//       });
//     } else {
//       url = `https://apihub.googleapis.com/v1/projects/${orgName}/locations/us-central1/apis/${orgName}-${apiproxyname}/versions/version-1/specs`;
//       const body = {
//         displayName: "OpenAPI 3.0 Spec",
//         contents: {
//           contents: Buffer.from(YAML.stringify(spec)).toString("base64"),
//           mimeType: "application/yaml",
//         },
//         specType: {
//           enumValues: {
//             values: [{id: "openapi"}],
//           },
//         },
//       };

//       res = await client.request<any>({
//         url: url,
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(body),
//       });
//     }

//     console.log(JSON.stringify(res.data, null, 2));

//     if (res.data.name) {
//       const url = `https://apihub.googleapis.com/v1/${res.data.name}:lint`;
//       const lintRes = await client.request<any>({
//         url: url,
//         method: "POST",
//       });
//       console.log(JSON.stringify(lintRes.data, null, 2));
//     }
//   } catch (e) {
//     if (e instanceof Error) {
//       console.log(e.message);
//     }
//   }
// };

const main = async (argv: string[]) => {
  if (argv.length < 1 || !argv[0]) {
    console.log("usage: node index.js org-name [proxyname] [revision]");
    return;
  }

  const apiProxyBundleProcessor = new ApiProxyBundleProcessor();
  const spectral = new Spectral();
  spectral.setRuleset({...oasRuleset, extends: []});

  const orgName = argv[0];

  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  const client = await auth.getClient();
  const hostnames = await getHostnames(client, orgName);

  if (argv.length === 1) {
    const apiProxies = await getApiProxyList(client, orgName);

    apiProxies.forEach(async (apiProxy) => {
      // console.log(`${proxy.name}, rev ${proxy.revision[0]}`);

      const apiProxyBundle = await getApiProxyBundle(
        client,
        orgName,
        apiProxy.name,
        apiProxy.revision[0],
      );

      const openapiSpec: OpenAPIV3.Document =
        await apiProxyBundleProcessor.generateOpenapiSpec(
          apiProxy.name,
          apiProxyBundle,
          hostnames,
        );
      // await createApiHubSpec(client, orgName, apiProxy.name, openapiSpec);
      console.log(YAML.stringify(openapiSpec));
    });
  } else if (argv[1]) {
    const apiProxy = argv[1];

    const revision = argv.length > 2 ? argv[2] : undefined;

    console.log(`${apiProxy}, rev ${revision || "LATEST"}`);

    const apiProxyBundle = await getApiProxyBundle(
      client,
      orgName,
      argv[1],
      revision,
    );

    const openapiSpec: OpenAPIV3.Document =
      await apiProxyBundleProcessor.generateOpenapiSpec(
        apiProxy,
        apiProxyBundle,
        hostnames,
      );

    // await createApiHubSpec(client, orgName, apiProxy, openapiSpec);

    // const backstageAPI = {
    //   apiVersion: "backstage.io/v1alpha1",
    //   kind: "API",
    //   metadata: {
    //     namespace: "default",
    //     name: openapiSpec.info.title,
    //     description: openapiSpec.info.description,
    //   },

    //   spec: {
    //     type: "openapi",
    //     lifecycle: "production",
    //     owner: "developers",
    //     system: "applications",
    //     definition: YAML.stringify(openapiSpec),
    //   },
    // };
    console.log("---");

    // console.log(YAML.stringify(backstageAPI));
    console.log(YAML.stringify(openapiSpec));

    const results = await spectral.run(openapiSpec as any);
    if (results.length) {
      console.error("Spectral Lint Errors:", results);
    }
  }
};

main(process.argv.slice(2)).catch(console.error);
