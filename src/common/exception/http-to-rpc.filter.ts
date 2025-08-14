import { Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

@Catch(HttpException)
export class HttpExceptionFilter extends BaseRpcExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): Observable<any> {
    const status = exception.getStatus();
    const message = exception.message;

    // Traducimos la HttpException a una RpcException estandarizada
    return throwError(
      () =>
        new RpcException({
          statusCode: status,
          message: message,
        }),
    );
  }
}
