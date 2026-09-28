export class ApiPathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ApiPathError';
	}
}

export function channelRequestUrl(baseUrl: string, instanceId: string, rawPath: string): string {
	const base = baseUrl.replace(/\/$/, '');
	const path = rawPath.trim();
	if (!path) {
		throw new ApiPathError('Enter an API path, for example templates or sendMessage.');
	}
	if (/token=/i.test(path)) {
		throw new ApiPathError('Remove the API key from the path. The credential adds it.');
	}

	let pathname = path;
	let search = '';
	if (/^https?:\/\//i.test(path)) {
		let url: URL | undefined;
		try {
			url = new URL(path);
		} catch {
			url = undefined;
		}
		if (!url) {
			throw new ApiPathError('That address is not a valid URL. Paste a path such as /templates.');
		}
		let baseHost = '';
		try {
			baseHost = new URL(base).host;
		} catch {
			baseHost = '';
		}
		if (!baseHost) {
			throw new ApiPathError('The credential Base URL is not valid.');
		}
		if (url.host !== baseHost) {
			throw new ApiPathError(
				'Use a path on your 1MSG API host, such as /templates. The API key is not sent to other websites.',
			);
		}
		pathname = url.pathname;
		search = url.search;
	} else {
		const queryAt = path.indexOf('?');
		if (queryAt >= 0) {
			pathname = path.slice(0, queryAt);
			search = path.slice(queryAt);
		}
	}

	if (!pathname.startsWith('/')) pathname = `/${pathname}`;
	if (pathname.includes('..')) {
		throw new ApiPathError('The API path cannot contain ..');
	}

	const prefix = `/${encodeURIComponent(instanceId)}`;
	const decodedPrefix = `/${instanceId}`;
	const alreadyScoped =
		pathname === decodedPrefix ||
		pathname.startsWith(`${decodedPrefix}/`) ||
		pathname === prefix ||
		pathname.startsWith(`${prefix}/`);
	const fullPath = alreadyScoped ? pathname : `${prefix}${pathname}`;
	return `${base}${fullPath}${search}`;
}
