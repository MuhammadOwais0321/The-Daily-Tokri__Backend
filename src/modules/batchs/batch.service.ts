import { Injectable } from '@nestjs/common';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchQueryDto } from './dto/batch-query.dto';

@Injectable()
export class BatchService {
  create(createBatchDto: CreateBatchDto) {
    return 'This action adds a new batch';
  }

  findAll(query: BatchQueryDto) {
    return `This action returns all batches`;
  }

  findOne(id: string) {
    return `This action returns a #${id} batch`;
  }

  update(id: string, updateBatchDto: UpdateBatchDto) {
    return `This action updates a #${id} batch`;
  }
}
