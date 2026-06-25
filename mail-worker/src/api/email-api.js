import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';
import fileUtils from '../utils/file-utils';

app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/email/delete', async (c) => {
	await emailService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.get('/email/attachment/:attId', async (c) => {
	const attId = Number(c.req.param('attId'));
	if (!Number.isSafeInteger(attId) || attId <= 0) {
		return c.json(result.fail('Invalid attachment ID', 400), 400);
	}

	const user = userContext.getUser(c);
	const download = await attService.download(
		c,
		attId,
		user.userId,
		user.email === c.env.admin
	);
	if (!download) {
		return c.json(result.fail('Attachment not found', 404), 404);
	}

	const { attachment, object } = download;
	const objectResponse = object instanceof Response ? object : null;
	const contentType = attachment.mimeType
		|| objectResponse?.headers.get('Content-Type')
		|| object.httpMetadata?.contentType
		|| 'application/octet-stream';
	const body = objectResponse ? objectResponse.body : object.body;

	const headers = new Headers({
		'Content-Type': contentType,
		'Content-Disposition': fileUtils.contentDisposition(attachment.filename),
		'Cache-Control': 'private, no-store',
		'X-Content-Type-Options': 'nosniff'
	});

	return new Response(body, { headers });
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})
