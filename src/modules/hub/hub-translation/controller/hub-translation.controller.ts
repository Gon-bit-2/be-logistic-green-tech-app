import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common'
import { ActiveUser } from 'src/common/decorators/active-user.decorator'
import { IsAdmin } from 'src/common/decorators/roles.decorator'
import {
  CreateHubTranslationBodyDTO,
  UpdateHubTranslationBodyDTO,
} from 'src/modules/hub/hub-translation/dto/hub-translation.dto'
import { HubTranslationService } from 'src/modules/hub/hub-translation/service/hub-translation.service'

@Controller('hub-translation')
export class HubTranslationController {
  constructor(private readonly hubTranslationService: HubTranslationService) {}

  @Post()
  @IsAdmin()
  create(@Body() createHubTranslationDto: CreateHubTranslationBodyDTO, @ActiveUser('userId') createdById: number) {
    return this.hubTranslationService.create({ createdById, data: createHubTranslationDto })
  }

  // @Get()
  // findAll() {
  //   return this.hubTranslationService.findAll()
  // }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.hubTranslationService.findById(id)
  }

  @Patch(':id')
  @IsAdmin()
  update(
    @Param('id') id: number,
    @Body() updateHubTranslationDto: UpdateHubTranslationBodyDTO,
    @ActiveUser('userId') updatedById: number,
  ) {
    return this.hubTranslationService.update({ updatedById, id, data: updateHubTranslationDto })
  }

  @Delete(':id')
  @IsAdmin()
  remove(@Param('id') id: number, @ActiveUser('userId') deletedById: number) {
    return this.hubTranslationService.delete({ deletedById, id })
  }
}
