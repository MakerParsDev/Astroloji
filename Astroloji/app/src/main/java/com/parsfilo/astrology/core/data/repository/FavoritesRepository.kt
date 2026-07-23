package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.core.data.local.FavoriteSignDao
import com.parsfilo.astrology.core.data.local.FavoriteSignEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FavoritesRepository
    @Inject
    constructor(
        private val favoriteSignDao: FavoriteSignDao,
    ) {
        suspend fun getFavorites(): List<String> =
            withContext(Dispatchers.IO) {
                favoriteSignDao.getAll().map { it.sign }
            }

        suspend fun toggle(sign: String) =
            withContext(Dispatchers.IO) {
                val favorites = favoriteSignDao.getAll().map { it.sign }.toSet()
                if (sign in favorites) {
                    favoriteSignDao.delete(sign)
                } else {
                    favoriteSignDao.upsert(FavoriteSignEntity(sign = sign, addedAt = System.currentTimeMillis()))
                }
            }

        suspend fun remove(sign: String) =
            withContext(Dispatchers.IO) {
                favoriteSignDao.delete(sign)
            }
    }
