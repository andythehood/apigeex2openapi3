# apigeex2openapi3

This is an experiment to update the existing [Apigee Edge Proxy to OpenAPI 2.0 conversion tool](https://github.com/anil614sagar/apigee2openapi.git) originally developed by Anil Sagar to provide support for ApigeeX and to generate OpenApi 3.0 compatible specifications.

It also is updated from Javascript to Typescript.

# Description

At its core, this tool provides a Typescript Class that takes an ApigeeX proxy bundle as input in ArrayBuffer format and returns an OpenApiSpec object, which can then be converted to YAML or JSON as required.

The tool makes an attempt to reverse engineer the OpenApi Specification from the proxy definition in ApigeeX. It extracts the OpenApiSpec paths and operations by parsing the conditional flow logic. It makes some assumptions about the format of the `<Condition>` element and pathsuffix and request.verb clauses. e.g.

```
    <Flow name="listCurrencies">
      <Description>List currencies</Description>
      <Request/>
      <Response/>
      <Condition>(proxy.pathsuffix MatchesPath "/currencies") and (request.verb = "GET")</Condition>
    </Flow>
```

It also makes a good attempt to extract any required header and query parameters by parsing `ExtractVariables` policies in the Flow or PreFlow.

This tool is by no means perfect.

## Installation

Eventually this should will be made available as an NPM module, but currently it is just provided as a Typescript Class in `ApiProxyBundleProcesser.ts`

## Usage

The API Proxy Bundle in ArrayBuffer format can be obtained using the [Apigee Rest API](https://cloud.google.com/apigee/docs/reference/apis/apigee/rest/v1/organizations.apis.revisions/get) by specifying the `format=bundle` option, e.g.:

```bash
  const url = `https://apigee.googleapis.com/v1/organizations/${orgName}/apis/${apiName}/revisions/${revision}?format=bundle`;
  const res = await client.request<Blob>({url});

  return await res.data.arrayBuffer();
```

The included `index.ts` program provides an example of how to use the Apigee Rest API to list all proxies for an Organization and then call this class for each proxy.

This program uses the [google-auth-library for NodeJS](https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest) and assumes you have Application Default Credentials configured.

```
$ npm start ORGNAME [PROXYNAME] [REVISION]

where:
- ORGNAME is the name of your ApigeeX Organization (same as the GCP ProjectId) [REQUIRED]
- PROXYNAME is the name of a single proxy in that Organization [OPTIONAL]
  If not specified, all proxies will be processed
- REVISION is the specifc revision number of the proxy [OPTIONAL]
  If not specified, the latest revision of the proxy will be processed
```

## Support

This is not an officially supported Google product

#### How to Contribute ?

Submit issues/feedback here https://github.com/andythehood/apigeex2openapi3
