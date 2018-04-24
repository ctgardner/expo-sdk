// @flow

import { Linking } from 'react-native';
import qs from 'qs';

import Constants from './Constants';

type ParsedURL = {
  path: ?string,
  queryParams: ?Object,
};

const { manifest } = Constants;

const USES_CUSTOM_SCHEME = Constants.appOwnership === 'standalone' && manifest.scheme;

let HOST_URI = manifest.hostUri;
if (!HOST_URI && !USES_CUSTOM_SCHEME) {
  // we're probably not using up-to-date xdl, so just fake it for now
  // we have to remove the /--/ on the end since this will be inserted again later
  HOST_URI = _removeScheme(Constants.linkingUri).replace(/\/--($|\/.*$)/, '');
}
const IS_EXPO_HOSTED =
  HOST_URI && /^(.*\.)?(expo\.io|exp\.host|exp\.direct|expo\.test)(:.*)?(\/.*)?$/.test(HOST_URI);

function _removeScheme(url) {
  return url.replace(/^.*:\/\//, '');
}

function _removeLeadingSlash(url) {
  return url.replace(/^\//, '');
}

function _removeTrailingSlash(url) {
  return url.replace(/\/$/, '');
}

function _removeTrailingSlashAndQueryString(url) {
  return url.replace(/\/?\?.*$/, '');
}

function makeUrl(path: ?string, queryParams: ?Object = {}): string {
  let scheme = 'exp';
  if (Constants.appOwnership === 'standalone') {
    scheme = manifest.scheme || (manifest.detach && manifest.detach.scheme);
  }
  if (!scheme) {
    throw new Error('Cannot make a deep link into a standalone app with no custom scheme defined');
  }

  let hostUri = HOST_URI || '';
  if (USES_CUSTOM_SCHEME && (IS_EXPO_HOSTED || manifest.developer)) {
    hostUri = '';
  }

  if (path) {
    if (IS_EXPO_HOSTED && hostUri) {
      path = `/--/${_removeLeadingSlash(path)}`;
    }

    if (!path.startsWith('/') && hostUri) {
      path = `/${path}`;
    } else if (path.startsWith('/') && !hostUri) {
      path = path.substr(1);
    }
  } else {
    path = IS_EXPO_HOSTED && hostUri ? '/--/' : '';
  }

  let queryString = '';
  let queryStringMatchResult = hostUri.match(/(.*)\?(.+)/);
  if (queryStringMatchResult) {
    hostUri = queryStringMatchResult[1];
    queryString = queryStringMatchResult[2];
    let paramsFromHostUri = {};
    try {
      let parsedParams = qs.parse(queryString);
      if (typeof parsedParams === 'object') {
        paramsFromHostUri = parsedParams;
      }
    } catch (e) {}
    queryParams = {
      ...queryParams,
      ...paramsFromHostUri,
    };
  }
  queryString = qs.stringify(queryParams);
  if (queryString) {
    queryString = `?${queryString}`;
  }

  hostUri = _removeTrailingSlash(hostUri);

  return encodeURI(`${scheme}://${hostUri}${path}${queryString}`);
}

function parse(url: string): ParsedURL {
  if (!url) {
    throw new Error('parse cannot be called with a null value');
  }
  let decodedUrl = decodeURI(url);
  let path = null;
  let queryParams = {};

  let queryStringMatchResult = decodedUrl.match(/(.*)\?(.+)/);
  if (queryStringMatchResult) {
    decodedUrl = queryStringMatchResult[1];
    queryParams = qs.parse(queryStringMatchResult[2]);
  }

  let hostUri = HOST_URI || '';
  let hostUriStripped = _removeTrailingSlashAndQueryString(hostUri);
  if (hostUriStripped && decodedUrl.indexOf(hostUriStripped) > -1) {
    path = decodedUrl.substr(decodedUrl.indexOf(hostUriStripped) + hostUriStripped.length);
  } else {
    path = _removeScheme(decodedUrl);
  }

  path = _removeLeadingSlash(path);

  if (IS_EXPO_HOSTED && !USES_CUSTOM_SCHEME && path.startsWith('--/')) {
    path = path.substr(3);
  } else if (path.indexOf('+') > -1) {
    path = path.substr(path.indexOf('+') + 1);
  }

  return { path, queryParams };
}

async function parseInitialURLAsync(): Promise<ParsedURL> {
  const initialUrl = await Linking.getInitialURL();
  return parse(initialUrl);
}

let newLinking = new Linking.constructor();

newLinking.makeUrl = makeUrl;
newLinking.parse = parse;
newLinking.parseInitialURLAsync = parseInitialURLAsync;

export default newLinking;
