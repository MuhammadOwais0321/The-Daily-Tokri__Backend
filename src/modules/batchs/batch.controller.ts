import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import { BatchService } from './batch.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchQueryDto } from './dto/batch-query.dto';

@Controller('batches')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post()
  create(@Body() createBatchDto: CreateBatchDto) {
    return this.batchService.create(createBatchDto);
  }

  @Get()
  findAll(@Query() query: BatchQueryDto) {
    return this.batchService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.batchService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBatchDto: UpdateBatchDto) {
    return this.batchService.update(id, updateBatchDto);
  }
}
