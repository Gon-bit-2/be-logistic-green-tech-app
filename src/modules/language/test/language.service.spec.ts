import { Test, TestingModule } from '@nestjs/testing';
import { LanguageService } from '../service/language.service';
import { LanguageRepository } from '../repository/language.repository';

describe('LanguageService', () => {
  let service: LanguageService;
  let repo: jest.Mocked<LanguageRepository>;

  beforeEach(async () => {
    // Tạo stub (mock) cho LanguageRepository
    const repoMock = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      createLanguage: jest.fn(),
      updateLanguage: jest.fn(),
      deleteLanguage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LanguageService,
        {
          provide: LanguageRepository,
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<LanguageService>(LanguageService);
    repo = module.get(LanguageRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('return array of languages with totalItems', async () => {
      const mockLangs = [{ id: 'vn', name: 'Vietnamese', icon: '', locale: 'vi' }];
      repo.findAll.mockResolvedValue(mockLangs as any);

      const result = await service.findAll();
      expect(result).toEqual({
        data: mockLangs,
        totalItems: 1,
      });
      expect(repo.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('return language object if exist', async () => {
      const mockLang = { id: 'en', name: 'English' };
      repo.findOne.mockResolvedValue(mockLang as any);

      const result = await service.findById('en');
      expect(result).toEqual(mockLang);
      expect(repo.findOne).toHaveBeenCalledWith('en');
    });

    it('throw Error when language not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findById('notFound')).rejects.toThrow('Ngôn ngữ không tồn tại');
      expect(repo.findOne).toHaveBeenCalledWith('notFound');
    });
  });

  describe('createLanguage', () => {
    it('should create new language when ID not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      
      const payload = { id: 'fr', name: 'French', icon: '', locale: 'fr', isDefault: false };
      const createdObj = { ...payload, createdById: 1 };
      repo.createLanguage.mockResolvedValue(createdObj as any);

      const result = await service.createLanguage({ data: payload, createdById: 1 });
      expect(result).toEqual(createdObj);
      expect(repo.findOne).toHaveBeenCalledWith('fr');
      expect(repo.createLanguage).toHaveBeenCalledWith({ data: payload, createdById: 1 });
    });

    it('throw Error when ID already exist', async () => {
      repo.findOne.mockResolvedValue({ id: 'en' } as any);

      const payload = { id: 'en', name: 'English', icon: '', locale: 'en', isDefault: false };
      await expect(service.createLanguage({ data: payload, createdById: 1 })).rejects.toThrow('Ngôn ngữ đã tồn tại');
    });
  });

  describe('update Language', () => {
    it('should update successful if language exists', async () => {
      repo.findOne.mockResolvedValue({ id: 'en' } as any);
      
      const updateData = { name: 'English Updated' };
      const updatedObj = { id: 'en', name: 'English Updated' };
      repo.updateLanguage.mockResolvedValue(updatedObj as any);

      const result = await service.update({ languageId: 'en', data: updateData, updateById: 2 });
      expect(result).toEqual(updatedObj);
      expect(repo.updateLanguage).toHaveBeenCalledWith({ languageId: 'en', data: updateData, updateById: 2 });
    });

    it('should throw error when updating unexist language', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update({ languageId: 'invalid', data: { name: '123' }, updateById: 1 })).rejects.toThrow('Ngôn ngữ không tồn tại');
    });
  });

  describe('remove', () => {
    it('successful delete', async () => {
      repo.findOne.mockResolvedValue({ id: 'en' } as any);
      repo.deleteLanguage.mockResolvedValue({} as any);

      const result = await service.remove('en', 1);
      expect(result).toEqual({ message: 'Xóa Thành Công' });
      expect(repo.deleteLanguage).toHaveBeenCalledWith('en', 1);
    });

    it('throw error if language does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove('en', 1)).rejects.toThrow('Ngôn ngữ không tồn tại');
    });
  });
});
