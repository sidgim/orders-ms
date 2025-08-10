import { Catch, RpcExceptionFilter, ArgumentsHost, HttpStatus, ExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

@Catch(RpcException)
export class RpcCustomExceptionFilter implements ExceptionFilter {
    catch(exception: RpcException, host: ArgumentsHost)  {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const rpcError = exception.getError();

        if (typeof rpcError === 'object' && 'status' in rpcError && 'message' in rpcError) {
            const status = isNaN(Number(rpcError.status)) ? HttpStatus.BAD_REQUEST : Number(rpcError.status);
            response.status(status).json(rpcError);
        }

        response.status(HttpStatus.BAD_REQUEST).json({
            status: HttpStatus.BAD_REQUEST,
            message: rpcError,
        })
    }
}
