import {
  BadRequestException,
  type ArgumentMetadata,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import type { ZodType } from "zod";

@Injectable()
export class ZodValidationPipe<TSchema extends ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map(
          (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`,
        ),
      );
    }
    return result.data;
  }
}
