package com.parsfilo.astrology.core.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.core.content.FileProvider
import androidx.core.graphics.createBitmap
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import java.io.File
import java.io.FileOutputStream
import kotlin.math.min

object HoroscopeCardRenderer {
    fun renderDailyCard(
        context: Context,
        horoscope: DailyHoroscope,
    ) = run {
        val sign = ZodiacSign.fromKey(horoscope.sign)
        val width = 1080
        val height = 1920
        val bitmap = createBitmap(width, height)
        val canvas = Canvas(bitmap)

        val startColor = sign.element.color
        val endColor =
            when (sign.element) {
                ZodiacElement.FIRE -> Color(0xFF1B0F19)
                ZodiacElement.EARTH -> Color(0xFF131812)
                ZodiacElement.AIR -> Color(0xFF101A26)
                ZodiacElement.WATER -> Color(0xFF081B24)
            }

        val backgroundPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader =
                    LinearGradient(
                        0f,
                        0f,
                        width.toFloat(),
                        height.toFloat(),
                        startColor.toArgb(),
                        endColor.toArgb(),
                        Shader.TileMode.CLAMP,
                    )
            }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), backgroundPaint)

        val haloPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.White.copy(alpha = 0.08f).toArgb()
            }
        canvas.drawCircle(width * 0.82f, height * 0.16f, width * 0.22f, haloPaint)
        canvas.drawCircle(width * 0.18f, height * 0.78f, width * 0.28f, haloPaint)

        val framePaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.White.copy(alpha = 0.11f).toArgb()
            }
        canvas.drawRoundRect(RectF(56f, 56f, width - 56f, height - 56f), 64f, 64f, framePaint)

        val titlePaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.White.toArgb()
                textSize = 72f
                isFakeBoldText = true
            }
        val captionPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.White.copy(alpha = 0.82f).toArgb()
                textSize = 40f
            }
        val symbolPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.White.copy(alpha = 0.92f).toArgb()
                textSize = 184f
                textAlign = Paint.Align.RIGHT
                isFakeBoldText = true
            }
        val bodyPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.White.copy(alpha = 0.96f).toArgb()
                textSize = 54f
            }
        val watermarkPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.White.copy(alpha = 0.72f).toArgb()
                textSize = 32f
            }

        val language = TimeUtils.normalizeLanguageTag(horoscope.language)
        val signLabel = sign.localizedName(language)

        canvas.drawText(signLabel, 110f, 190f, titlePaint)
        canvas.drawText(TimeUtils.displayDate(language), 110f, 246f, captionPaint)
        canvas.drawText(sign.symbol, width - 110f, 210f, symbolPaint)

        drawWrappedText(
            canvas = canvas,
            text = horoscope.short,
            paint = bodyPaint,
            startX = 110f,
            startY = 430f,
            maxWidth = width - 220f,
            lineHeight = 78f,
            maxLines = 6,
        )

        val statsTop = 980f
        drawStatRow(canvas, captionPaint, bodyPaint, 110f, statsTop, "Energy", horoscope.energy)
        drawStatRow(canvas, captionPaint, bodyPaint, 110f, statsTop + 120f, "Love", horoscope.loveScore)
        drawStatRow(canvas, captionPaint, bodyPaint, 110f, statsTop + 240f, "Career", horoscope.careerScore)
        drawStatRow(canvas, captionPaint, bodyPaint, 110f, statsTop + 360f, "Money", horoscope.moneyScore)
        drawStatRow(canvas, captionPaint, bodyPaint, 110f, statsTop + 480f, "Health", horoscope.healthScore)

        canvas.drawText("parsfilo.com", 110f, height - 154f, watermarkPaint)
        canvas.drawText("Astrology", width - 110f, height - 154f, watermarkPaint.apply { textAlign = Paint.Align.RIGHT })

        val sharedDir = File(context.cacheDir, "shared").apply { mkdirs() }
        val file = File(sharedDir, "daily-${horoscope.sign}-${horoscope.date}.png")
        FileOutputStream(file).use { output ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
        }
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    }

    private fun drawStatRow(
        canvas: Canvas,
        labelPaint: Paint,
        valuePaint: Paint,
        x: Float,
        y: Float,
        label: String,
        value: Int,
    ) {
        canvas.drawText(label.uppercase(), x, y, labelPaint)
        canvas.drawText("${value.coerceIn(0, 100)}%", x, y + 58f, valuePaint)
    }

    private fun drawWrappedText(
        canvas: Canvas,
        text: String,
        paint: Paint,
        startX: Float,
        startY: Float,
        maxWidth: Float,
        lineHeight: Float,
        maxLines: Int,
    ) {
        val words = text.split("\\s+".toRegex()).filter { it.isNotBlank() }
        if (words.isEmpty()) {
            return
        }
        val lines = mutableListOf<String>()
        var current = ""
        for (word in words) {
            val candidate = if (current.isBlank()) word else "$current $word"
            if (paint.measureText(candidate) <= maxWidth) {
                current = candidate
            } else {
                if (current.isNotBlank()) {
                    lines += current
                }
                current = word
                if (lines.size == maxLines - 1) {
                    break
                }
            }
        }
        if (lines.size < maxLines && current.isNotBlank()) {
            lines += current
        }

        lines.take(maxLines).forEachIndexed { index, line ->
            val rendered =
                if (index == min(lines.lastIndex, maxLines - 1) && lines.size > maxLines) {
                    "$line…"
                } else {
                    line
                }
            canvas.drawText(rendered, startX, startY + (index * lineHeight), paint)
        }
    }
}
