const fs = require('fs');
const net = require('net');
const chalk = require('chalk');
const minimist = require('minimist');

const write = console.log;
const { red, green, cyanBright: cyan, yellow } = chalk;

const LOG_FILE = 'log.txt';

const HOST = 'localhost';
const PORT = 1046;

const DEFAULT_INTERVAL = 1; // s
const DEFAULT_SIZE = 64; // bytes
const MAX_MESSAGE_SIZE = 256; // 65536 indeed
const MIN_MESSAGE_SIZE = 7;

const args = minimist(process.argv.slice(2));
const isWhoFlow = args._.includes('who');

const getStringFromMessage = (data) => {
	const emptyBytesFrom = data.indexOf(0x00, 1);
	const sliceTo = emptyBytesFrom === -1 ? undefined : emptyBytesFrom;

	return data.subarray(1, sliceTo).toString();
};

const logToFile = async (text) => {
	fs.appendFileSync(LOG_FILE, new Date().toLocaleString() + '  ' + text + '\n');
};

const sendAndLog = (socket, data) => {
	socket.write(data);
	logToFile(`Sent message     (${data.byteLength} bytes): ${data[0]} | ${getStringFromMessage(data)}`);
};

const getConfig = () => {
	return {
		interval: args.i ?? args.int ?? args.interval ?? args.t ?? args.time ?? DEFAULT_INTERVAL,
		size: args.s ?? args.size ?? args.b ?? args.bytes ?? DEFAULT_SIZE
	};
};

const validateConfig = (config) => Object.entries(config).every(
	([key, value]) => {
		if (typeof value !== 'number' || value <= 0 || !isFinite(value)) {
			write(`Invalid ${cyan(key)} value: ${
				value === true ? red('not specified') : red.bold(value)
			}`);
		} else if (key === 'size' && (value > MAX_MESSAGE_SIZE || value < MIN_MESSAGE_SIZE)) {
			write(`Wrong size value. The value can not be higher than ${MAX_MESSAGE_SIZE} and lower than ${MIN_MESSAGE_SIZE}`);
		} else {
			return true;
		}
	}
);

const handleResponse = (data, message, sentAtMap) => {
	const receivedAt = process.hrtime.bigint();

	const msgNumber = message.match(/\d+/g);

	const timeDiffInMs = Number(receivedAt - sentAtMap[msgNumber]) / 1e6;
	const showInSeconds = timeDiffInMs > 1000;

	const timeDiff = showInSeconds ? timeDiffInMs / 1000 : timeDiffInMs;

	write(`${
		yellow(`Test #${msgNumber}`)
	}, time: ${
		cyan(`${(timeDiff).toFixed(3)} ${showInSeconds ? 's' : 'ms'}`)
	}, size: ${
		green(`${data.byteLength} bytes`)
	}`);

	delete sentAtMap[msgNumber];
};

const startPing = (socket, sentAtMap, { interval, size }, closeConnection) => {
	write(`Pinging server every ${
		cyan.bold(`${interval} sec`)
	} with ${
		green.bold(`${size} bytes`)
	} messages...\n`);

	let msgNumber = 0;

	const intervalId = setInterval(() => {
		const message = Buffer.alloc(size);
		const [header, data] = [1, `ping ${++msgNumber}`];

		if (data.length + 1 > size) {
			clearInterval(intervalId);
			write('Test ended');
			closeConnection();
			return;
		}

		message.writeInt8(header);
		message.write(data, 1);

		sentAtMap[msgNumber] = process.hrtime.bigint();

		sendAndLog(socket, message);
	}, interval * 1000);
};

const initSocketConnection = (params) => {
	const socket = new net.Socket();
	const sentAtMap = {};

	const closeConnection = (errorText) => {
		socket.destroy();
		if (errorText) {
			write(red('Error: ') + errorText);
			logToFile('Error: ' + errorText);
		}
		if (!errorText || !errorText.includes('ECONNREFUSED')) {
			write(cyan('\nConnection closed'));
			logToFile('Disconnected from the server\n');
		}
		process.exit();
	};

	socket.connect(PORT, HOST, () => {
		write(green('Connected!\n'));
		logToFile('Connected to the server');
		
		const [header, data] = [0, isWhoFlow ? 'who' : 'hello'];
		const helloMessage = Buffer.alloc(data.length + 1);

		helloMessage.writeInt8(header);
		helloMessage.write(data, 1);

		sendAndLog(socket, helloMessage);
	});

	socket.on('data', (data) => {
		const header = data[0];
		const message = data.subarray(1).toString();

		logToFile(`Received message (${data.byteLength} bytes): ${header} | ${getStringFromMessage(data)}`);

		let error = null;

		const setUnknownMessageError = () => {
			error = 'Unknown message from server: ' + message;
		};
		
		if (header === 0) {
			if (isWhoFlow) {
				write('WHO: ', message);
				closeConnection();
			} else if (message === 'hello') {
				startPing(socket, sentAtMap, params, closeConnection);
			} else {
				setUnknownMessageError();
			}
		} else if (header === 1) {
			if (message.startsWith('ping ')) {
				handleResponse(data, message, sentAtMap);
			} else {
				setUnknownMessageError();
			}
		} else if (header === 2) {
			error = 'The server notified about error: ' + message;
		} else {
			error = 'Unknown header received from server: ' + message;
		}

		if (error) {
			closeConnection(error);
		}
	});

	socket.on('error', (error) => {
		closeConnection(error.message);
	});

	process.on('SIGINT', function() {
		closeConnection();
	});
};

const main = () => {
	write();
	const config = getConfig();
	const isConfigValid = validateConfig(config);

	if (isConfigValid) {
		initSocketConnection(config);
	} else {
		write();
	}
};

main();
