import express from 'express';

import { pipeline } from 'stream';
import { promisify } from 'util';

const app = express();
const pipelineAsync = promisify(pipeline);

// Безопасная обертка с ловушкой исключений
function SafeWrapper(fn) {
	return (req, res, next) => {
		Promise.resolve(fn(req, res, next)).catch((err) => {
			try {
				console.error('Internal error at', req.originalUrl, err);
				return res.status(500).send(JSON.stringify({ error: 'Internal server error' }));
			}
			catch (_err) { /*do nothing*/ }
		});
	};
}

// Промежуточный обработчик для получения instanceId и instanceToken
// TODO: по-хорошему надо проверять формальную корректность полученных данных (допустимые значения)
async function AuthMiddleware(req, res, next) {
	const auth = {
		instanceId: req.get('X-Instance-Id'),
		instanceToken: req.get('X-Instance-Token'),
	}
	if (!auth.instanceId || !auth.instanceToken) {
		return res.status(401).send(JSON.stringify({ error: 'Unauthorized' }));
	}
	res.locals.auth = auth;
	return next()
}

// Запрос REST API с пробросом ответа клиенту
async function CallApiProxy(res, method, path, body) {
	const { instanceId, instanceToken } = res.locals.auth;
	const url = `https://api.green-api.com/waInstance${instanceId}/${path}/${instanceToken}`

	console.log(`Call Api ${method} ${path}`);

	const response = await fetch(url, {
		method: method,
		headers: body ? {
			'Content-Type': 'application/json',
		} : {},
		body: body,
	});

	res.status(response.status);
	await pipelineAsync(response.body, res);
}

function SetupControllers() {
	app.get('/getSettings', SafeWrapper(async (req, res) => {
		return CallApiProxy(res, 'GET', 'getSettings');
	}));
	
	app.get('/getStateInstance', SafeWrapper(async (req, res) => {
		return CallApiProxy(res, 'GET', 'getStateInstance');
	}));
	
	app.post('/sendMessage', SafeWrapper(async (req, res) => {
		const { chatId, message } = req.body;
	
		// TODO: по-хорошему надо тщательно проверить параметры запроса на допустимые значения
		if (!chatId || typeof chatId !== 'string' || !message || typeof message !== 'string') {
			return res.status(400).send(JSON.stringify({ error: 'Wrong params' }));
		}
	
		return CallApiProxy(res, 'POST', 'sendMessage', JSON.stringify({
			chatId: chatId,
			message: message,
		}));
	}));
	
	app.post('/sendFileByUrl', SafeWrapper(async (req, res) => {
		const { chatId, urlFile, fileName } = req.body;
	
		// TODO: по-хорошему надо тщательно проверить параметры запроса на допустимые значения
		if (!chatId || typeof chatId !== 'string' || !urlFile || typeof urlFile !== 'string'
			|| !fileName || typeof fileName !== 'string') {
			return res.status(400).send(JSON.stringify({ error: 'Wrong params' }));
		}
	
		return CallApiProxy(res, 'POST', 'sendFileByUrl', JSON.stringify({
			chatId: chatId,
			urlFile: urlFile,
			fileName: fileName,
		}));
	}));
	
	app.all('*', SafeWrapper(async (req, res) => {
		return res.status(404).send(JSON.stringify({ error: 'Not found' }));
	}));
}

app.use(express.json({
	limit: '16kb',
	type: 'application/json',
}));

app.use(SafeWrapper(AuthMiddleware));

SetupControllers()

const port = Number(process.env.APP_PORT ?? 3000);
const server = app.listen(port, () => console.log('Server started on port', port));

function StopServer() {
	if (server.listening) {
		server.close((err) => console.log('Server closed', err));
	}
	setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', () => {
	console.log('SIGTERM event');
	StopServer();
});

process.on('SIGINT', () => {
	console.log('SIGINT event');
	StopServer();
});
